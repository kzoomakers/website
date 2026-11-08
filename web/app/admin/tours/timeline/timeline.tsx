"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { hue } from "@/lib/tours-fmt";
import type { TimelineEvent } from "@/lib/tours";
import { tours } from "../rpc";

const GROUPS: [string, string][] = [["bookings", "Bookings"], ["walkups", "Walk-ups"], ["messages", "Conversations"], ["reminders", "Reminders"]];
const ICON: Record<string, string> = { booking: "📅", cancel: "🚫", status: "🏷️", walkup_new: "🚶", walkup_taken: "🙋", walkup_confirmed: "✅", walkup_declined: "↩️", walkup_closed: "🗑️", walkup_reopened: "♻️", message: "✉️", note: "📝", message_visitor: "💬", reminder_6h: "⏰", reminder_3h: "⏰", reminder_1h: "⏰", reminder_now: "🔔" };
const day = (d: string) => new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const ago = (d: string) => { const s = (Date.now() - +new Date(d)) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : ""; };

// What happened with tours, newest first: bookings, walk-ups, conversations, and the "due now / in 1, 3, 6 hours" reminders.
export default function Timeline({ initial }: { initial: TimelineEvent[] }) {
  const [rows, setRows] = useState(initial), [groups, setGroups] = useState<string[]>([]), [q, setQ] = useState(""), [live, setLive] = useState(true), [more, setMore] = useState(initial.length === 100), [err, setErr] = useState(""), first = useRef(true);
  const fetchRows = useCallback((before?: number) => tours<TimelineEvent[]>("timeline", { before, groups, q }), [groups, q]);
  const refresh = useCallback(async () => { try { const r = await fetchRows(); setRows(r); setMore(r.length === 100); setErr(""); } catch (e: any) { setErr(e.message); } }, [fetchRows]);
  useEffect(() => { if (first.current) { first.current = false; return; } const t = setTimeout(refresh, 250); return () => clearTimeout(t); }, [refresh]);
  useEffect(() => { if (!live) return; const t = setInterval(refresh, 30000); return () => clearInterval(t); }, [live, refresh]);
  const older = async () => { try { const r = await fetchRows(rows[rows.length - 1]?.id); setRows([...rows, ...r]); setMore(r.length === 100); } catch (e: any) { setErr(e.message); } };
  const toggle = (g: string) => setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g]);
  let lastDay = "";
  return (
    <>
      <h1>Timeline</h1>
      <p className="sub">Everything that happens with tours, newest first: bookings and cancellations, walk-up requests and who took them, conversations, and a reminder line when an appointment is 6 hours, 3 hours and 1 hour away and when it is due.</p>
      <div className="bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, guides, messages…" aria-label="Search" style={{ minWidth: 260 }} />
        {GROUPS.map(([g, l]) => <button key={g} type="button" className={groups.includes(g) ? "pri" : ""} aria-pressed={groups.includes(g)} onClick={() => toggle(g)}>{l}</button>)}
        <label><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live</label>
        {err && <span role="alert" className="sub" style={{ margin: 0, color: "var(--bad)" }}>{err}</span>}
      </div>
      <div style={{ position: "relative", marginLeft: 14, paddingLeft: 26, borderLeft: "2px solid var(--line)" }}>
        {rows.map((e) => {
          const d = day(e.at), head = d !== lastDay ? (lastDay = d) : "", rem = e.kind.startsWith("reminder"), now = e.kind === "reminder_now", c = e.guide ? `hsl(${hue(e.guide)} 62% 52%)` : "";
          return (
            <div key={e.id}>
              {head && <div style={{ margin: "22px 0 8px -26px", paddingLeft: 26, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--mut)" }}>{head}</div>}
              <div style={{ position: "relative", margin: "0 0 10px", padding: "10px 14px", borderRadius: 12, background: now ? "color-mix(in srgb, #ef4444 14%, var(--card))" : rem ? "var(--acc-bg)" : "var(--card)", border: `1px solid ${now ? "#ef4444" : "var(--line)"}`, borderLeft: c ? `4px solid ${c}` : undefined }}>
                <span aria-hidden style={{ position: "absolute", left: -44, top: 10, width: 32, height: 32, borderRadius: 16, display: "grid", placeItems: "center", background: "var(--card)", border: "2px solid var(--line)", fontSize: 15 }}>{ICON[e.kind] ?? "•"}</span>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong style={{ fontWeight: rem ? 700 : 600 }}>{e.title}</strong>
                  <span className="sub" style={{ margin: 0, whiteSpace: "nowrap" }} title={new Date(e.at).toLocaleString()}>{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{ago(e.at) && ` · ${ago(e.at)}`}</span>
                </div>
                {e.detail && <div className="sub" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{e.detail}</div>}
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="sub">Nothing yet.</p>}
      </div>
      {more && <button onClick={older}>Load older</button>}
    </>
  );
}
