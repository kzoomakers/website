"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalItem } from "@/lib/tours";
import { hue } from "@/lib/tours-fmt";
import { tours } from "./rpc";

const HOUR = 56; // px per hour
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(+new Date(s + "T12:00:00Z") + n * 864e5));
const sunday = (s: string) => addDays(s, -new Date(s + "T12:00:00Z").getUTCDay());
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const clock = (t: string) => { const h = +t.slice(0, 2), m = t.slice(3, 5); return `${h % 12 || 12}${m === "00" ? "" : ":" + m}`; };
const range = (a: string, b: string) => `${clock(a)}–${clock(b)} ${+b.slice(0, 2) >= 12 ? "PM" : "AM"}`;
const hourLabel = (h: number) => (h === 12 ? "Noon" : `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`);
const monthDay = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const who = (i: CalItem) => i.guide || i.guide_email || "Unassigned";
const tint = (i: CalItem) => (i.guide || i.guide_email ? hue((i.guide_email || i.guide).toLowerCase()) : -1);
const color = (h: number) => (h < 0 ? { fg: "hsl(220 8% 55%)", bg: "hsl(220 8% 55% / .14)" } : { fg: `hsl(${h} 62% 52%)`, bg: `hsl(${h} 70% 50% / .16)` });

/** Overlapping cards share the day's width: sorted by start, each takes the first free lane in its cluster. */
function lanes(list: CalItem[]) {
  const out = new Map<string, { lane: number; of: number }>(), s = [...list].sort((a, b) => mins(a.start) - mins(b.start) || mins(b.end) - mins(a.end));
  let cluster: CalItem[] = [], ends: number[] = [], clusterEnd = 0;
  const flush = () => { for (const i of cluster) out.get(i.key)!.of = ends.length; cluster = []; ends = []; };
  for (const i of s) {
    if (cluster.length && mins(i.start) >= clusterEnd) flush();
    let l = ends.findIndex((e) => e <= mins(i.start));
    if (l < 0) { l = ends.length; ends.push(0); }
    ends[l] = mins(i.end); clusterEnd = Math.max(clusterEnd, mins(i.end));
    out.set(i.key, { lane: l, of: 1 }); cluster.push(i);
  }
  flush();
  return out;
}

// This week at a glance: confirmed tours (solid) and times offered to walk-ups still waiting to answer (dashed), coloured by guide.
export default function WeekCalendar() {
  const [start, setStart] = useState<string | null>(null), [items, setItems] = useState<CalItem[]>([]), [now, setNow] = useState<{ base: number; at: number } | null>(null), [open, setOpen] = useState<CalItem | null>(null), [err, setErr] = useState(""), [loading, setLoading] = useState(true), [tick, setTick] = useState(0);
  const load = useCallback(async (s: string) => {
    setLoading(true); setErr("");
    try { const r = await tours<{ items: CalItem[]; now: string }>("calendar", { from: s, to: addDays(s, 7) }); setItems(r.items); setNow({ base: +new Date(r.now.replace(" ", "T") + ":00Z"), at: Date.now() }); if (!start) setStart(s); }
    catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, [start]);
  // First load: ask the server for "now" in the club's time zone so the first week shown is the right one.
  useEffect(() => { if (!start) tours<{ now: string }>("calendar", { from: "2000-01-01", to: "2000-01-02" }).then((r) => { const s = sunday(r.now.slice(0, 10)); setStart(s); }).catch((e) => setErr(e.message)); }, [start]);
  useEffect(() => { if (start) load(start); }, [start]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);

  const cur = now ? new Date(now.base + (Date.now() - now.at)).toISOString() : "", today = cur.slice(0, 10), nowMin = cur ? mins(cur.slice(11, 16)) : -1;
  void tick;
  const days = start ? Array.from({ length: 7 }, (_, i) => addDays(start, i)) : [];
  const [h0, h1] = useMemo(() => {
    const lo = Math.min(9, ...items.map((i) => Math.floor(mins(i.start) / 60))), hi = Math.max(18, ...items.map((i) => Math.ceil(mins(i.end) / 60)));
    return [lo, Math.min(24, hi)];
  }, [items]);
  const guides = useMemo(() => [...new Map(items.map((i) => [who(i), tint(i)])).entries()].sort((a, b) => a[0].localeCompare(b[0])), [items]);
  const byDay = (d: string) => items.filter((i) => i.date === d);
  const confirmed = items.filter((i) => i.confirmed).length;

  return (
    <section aria-label="This week's tours" style={{ marginBottom: 28 }}>
      <div className="bar" style={{ marginBottom: 10, justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => start && setStart(addDays(start, -7))} aria-label="Previous week">‹</button>
          <button onClick={() => today && setStart(sunday(today))}>Today</button>
          <button onClick={() => start && setStart(addDays(start, 7))} aria-label="Next week">›</button>
          <h2 style={{ margin: "0 0 0 8px", fontSize: 20 }}>{start ? `${monthDay(start)} – ${monthDay(addDays(start, 6))}` : "…"}</h2>
          {loading && <span className="sub" style={{ margin: 0 }}>Loading…</span>}
        </div>
        <span className="sub" style={{ margin: 0 }}><b>{confirmed}</b> confirmed · <b>{items.length - confirmed}</b> awaiting reply</span>
      </div>
      {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}
      <div className="bar" style={{ gap: 8, marginBottom: 10, fontSize: 13 }}>
        {guides.map(([g, h]) => <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: color(h).fg }} />{g}</span>)}
        <span className="sub" style={{ margin: 0, marginLeft: "auto" }}><i style={{ display: "inline-block", width: 18, height: 10, borderRadius: 3, background: "var(--acc-bg)", border: "1.5px solid var(--acc)", verticalAlign: "middle" }} /> confirmed &nbsp; <i style={{ display: "inline-block", width: 18, height: 10, borderRadius: 3, border: "1.5px dashed var(--acc)", verticalAlign: "middle" }} /> awaiting reply</span>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)" }}>
        <div style={{ minWidth: 760 }}>
          <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--card)", zIndex: 3 }}>
            <div />
            {days.map((d, i) => (
              <div key={d} style={{ padding: "10px 8px", textAlign: "center", borderLeft: "1px solid var(--line)" }}>
                <div className="sub" style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>{DAYS[i]}</div>
                <div style={{ display: "inline-grid", placeItems: "center", minWidth: 30, height: 30, borderRadius: 15, fontWeight: 700, fontSize: 17, background: d === today ? "var(--acc)" : "none", color: d === today ? "var(--bg)" : "var(--ink)" }}>{+d.slice(8)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", position: "relative", height: (h1 - h0) * HOUR }}>
            <div style={{ position: "relative" }}>
              {Array.from({ length: h1 - h0 }, (_, k) => <div key={k} className="sub" style={{ position: "absolute", top: k * HOUR - 7, right: 8, margin: 0, fontSize: 11 }}>{k === 0 ? "" : hourLabel(h0 + k)}</div>)}
            </div>
            {days.map((d) => {
              const list = byDay(d), pos = lanes(list);
              return (
                <div key={d} style={{ position: "relative", borderLeft: "1px solid var(--line)", background: d === today ? "color-mix(in srgb, var(--acc) 5%, transparent)" : undefined }}>
                  {Array.from({ length: h1 - h0 }, (_, k) => <div key={k} style={{ position: "absolute", left: 0, right: 0, top: k * HOUR, borderTop: k ? "1px solid var(--line)" : 0, opacity: .6 }} />)}
                  {list.map((i) => {
                    const { lane, of } = pos.get(i.key)!, c = color(tint(i)), top = ((mins(i.start) - h0 * 60) / 60) * HOUR, h = Math.max(26, ((mins(i.end) - mins(i.start)) / 60) * HOUR - 2);
                    return (
                      <button key={i.key} onClick={() => setOpen(i)} title={`${i.visitor} with ${who(i)}`}
                        style={{ position: "absolute", top, height: h, left: `calc(${(lane / of) * 100}% + 3px)`, width: `calc(${100 / of}% - 6px)`, textAlign: "left", cursor: "pointer", overflow: "hidden", padding: "4px 8px", borderRadius: 8, font: "inherit", fontSize: 12, lineHeight: 1.3, color: "var(--ink)",
                          background: i.confirmed ? c.bg : `repeating-linear-gradient(135deg, ${c.bg} 0 6px, transparent 6px 12px)`, border: `1.5px ${i.confirmed ? "solid" : "dashed"} ${c.fg}`, borderLeftWidth: 4, borderLeftStyle: "solid", boxShadow: i.confirmed ? "0 1px 2px rgb(0 0 0 / .12)" : "none", zIndex: 1 }}>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.visitor}</div>
                        <div style={{ opacity: .75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{range(i.start, i.end)}</div>
                        {h > 54 && <div style={{ marginTop: 2, color: c.fg, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>● {who(i)}{!i.confirmed && " · awaiting reply"}</div>}
                      </button>
                    );
                  })}
                  {d === today && nowMin >= h0 * 60 && nowMin < h1 * 60 && (
                    <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: ((nowMin - h0 * 60) / 60) * HOUR, borderTop: "2px solid #ef4444", zIndex: 2 }}><i style={{ position: "absolute", left: -5, top: -6, width: 10, height: 10, borderRadius: 5, background: "#ef4444" }} /></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!loading && !items.length && !err && <p className="sub" style={{ marginTop: 10 }}>No tours this week.</p>}

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgb(0 0 0 / .45)", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
          <div role="dialog" aria-label="Tour details" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "100%", background: "var(--card)", color: "var(--ink)", border: "1px solid var(--line)", borderTop: `5px solid ${color(tint(open)).fg}`, borderRadius: 14, padding: 20, boxShadow: "0 20px 60px rgb(0 0 0 / .4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="tag" style={{ padding: 0, color: open.confirmed ? "var(--ok)" : "var(--mut)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{open.confirmed ? "Confirmed" : "Awaiting reply"}{open.walkup && " · walk-up"}</div>
                <h3 style={{ margin: "4px 0 2px", fontSize: 20 }}>{open.visitor}</h3>
                <div className="sub" style={{ margin: 0 }}>{new Date(open.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })} · {range(open.start, open.end)}</div>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" style={{ alignSelf: "flex-start" }}>✕</button>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "8px 12px", margin: "16px 0 0", fontSize: 14 }}>
              <dt className="sub" style={{ margin: 0 }}>Guide</dt><dd style={{ margin: 0, color: color(tint(open)).fg, fontWeight: 600 }}>● {who(open)}{open.guide_email && open.guide && <span className="sub" style={{ margin: 0, fontWeight: 400 }}> · {open.guide_email}</span>}</dd>
              <dt className="sub" style={{ margin: 0 }}>Email</dt><dd style={{ margin: 0 }}><a href={`mailto:${open.email}`}>{open.email}</a></dd>
              <dt className="sub" style={{ margin: 0 }}>Phone</dt><dd style={{ margin: 0 }}><a href={`tel:${open.phone}`}>{open.phone}</a></dd>
              {open.interest && <><dt className="sub" style={{ margin: 0 }}>Interested in</dt><dd style={{ margin: 0 }}>{open.interest}</dd></>}
              {open.notes && <><dt className="sub" style={{ margin: 0 }}>Notes</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{open.notes}</dd></>}
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
