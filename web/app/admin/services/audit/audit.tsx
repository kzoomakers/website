"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog, alertDialog } from "@/components/dialog";
import { guidedDef, guidedLines } from "@/lib/guided";
import { AUDIT_SECTIONS, sectionOf } from "@/lib/audit-areas";
import { ago } from "../../webmaster/ago";
import { seqDiff } from "../../webmaster/diff";
import DiffView from "../../webmaster/diff-view";

type Row = { id: number; at: string; actor: string; action: string; target: string };
type Detail =
  | { kind: "none" }
  | { kind: "page" | "data"; family?: string; before: any; after: any; revertable: boolean; why: string; newer: number; subject: string; undo?: "revert" | "restore" };

// Plain-English headline for an audit entry.
const VERB: Record<string, string> = { save: "Edited", revert: "Reverted", restore: "Restored", delete: "Deleted", import: "Initial version of", url: "Changed the link of", flush: "Flushed the cache of", create: "Created" };
const AREA: Record<string, string> = { page: "a page", menu: "the menu", board: "the board page", calendar: "the calendar", hours: "the hours", robots: "robots.txt", privacy: "the privacy statement" };
function headline(action: string) {
  const [area, second] = action.split(".");
  const verb = VERB[action.split(".").pop()!] ?? action;
  if (!AREA[area] && area !== "guided" && !(action.split(".").pop()! in VERB)) return `${area[0].toUpperCase() + area.slice(1)}: ${action.slice(area.length + 1).replace(/[_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`;
  return `${verb} ${area === "guided" ? `the ${guidedDef(second)?.label ?? second} page` : AREA[area] ?? area}`;
}

const menuLines = (m: any[], d = 0): string[] => m.flatMap((i) => [`${"  ".repeat(d)}${i.label}${i.href ? ` → ${i.href}` : ""}`, ...(i.items ? menuLines(i.items, d + 1) : [])]);
function lines(family: string, d: any): string[] {
  if (family === "menu") return menuLines(d);
  if (family === "robots" || family === "privacy") return d.text.split("\n");
  if (family === "hours") return [`Open: ${d.schedule.openDays.join(", ")}`, `Time: ${d.schedule.openTime} - ${d.schedule.closeTime}`, `Closed message: ${d.schedule.closedMessage}`, `Closed today message: ${d.schedule.closedMessageToday}`, `Address: ${d.contact.address}`];
  if (family === "board") return [`Heading: ${d.title}`, `Intro: ${d.intro}`, ...d.members.map((m: any) => `${m.name} · ${m.role} · ${m.photo} · ${m.bio}`)];
  if (family === "calendar") return [`Calendar feed link: ${d.url}`];
  const def = guidedDef(family.slice(7));
  return def ? guidedLines(def.fields, d) : [JSON.stringify(d)];
}

function LineDiff({ family, before, after }: { family: string; before: any; after: any }) {
  const d = seqDiff(before ? lines(family, before) : [], lines(family, after)).filter((l) => l.t !== " ");
  if (!d.length) return <p className="sub">No visible changes.</p>;
  const n = (t: string) => d.filter((l) => l.t === t).length;
  return (
    <div className="diff">
      <div className="diffsum">{n("+") > 0 && <span className="chip c-added">{n("+")} added</span>} {n("-") > 0 && <span className="chip c-removed">{n("-")} removed</span>}</div>
      {d.map((l, j) => <div key={j} className={`dl d${l.t === "+" ? "a" : "r"}`}><span>{l.t}</span>{l.v}</div>)}
    </div>
  );
}

function Details({ r, onDone }: { r: Row; onDone: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/webmaster/audit?id=${r.id}`).then((x) => (x.ok ? x.json() : { kind: "none" })).then(setD).catch(() => setD({ kind: "none" })); }, [r.id]);
  if (!d) return <p className="sub">Loading…</p>;
  if (d.kind === "none")
    return <p className="sub">{headline(r.action)}{r.target ? ` (${r.target})` : ""}. Nothing on the site changed, so there is nothing to compare or revert.</p>;
  const revert = async () => {
    const what = d.undo === "restore" ? `${d.subject} will be put back, as it was before it was deleted.` : `${d.subject} will go back to how it was before this change.`;
    const more = d.newer ? `\n\n${d.newer} newer change${d.newer > 1 ? "s" : ""} to it will be undone as well.` : "";
    if (!(await confirmDialog(`Are you sure you want to revert this?\n\n${what}${more}\n\nThe revert is recorded here, so you can undo it again.`, { ok: "Yes, revert", danger: true }))) return;
    setBusy(true);
    const x = await fetch("/api/webmaster/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revert: r.id }) });
    setBusy(false);
    if (x.ok) onDone(); else await alertDialog(await x.text());
  };
  return (
    <div>
      {d.kind === "page" ? <DiffView before={d.before} after={d.after} /> : <LineDiff family={d.family!} before={d.before} after={d.after} />}
      <div className="bar">
        {d.revertable
          ? <button className="danger" disabled={busy} onClick={revert}>{d.undo === "restore" ? "↩ Restore this page" : "↩ Revert this change"}</button>
          : <span className="sub">Can't be reverted: {d.why}</span>}
      </div>
    </div>
  );
}

type Facet = { v: string; n: number };
type Result = { rows: Row[]; total: number; buckets: { t: string; action: string; n: number }[]; actors: Facet[]; actions: Facet[] };
type F = { actors: string[]; sections: string[]; actions: string[] };
const RANGES = [["24h", "Last 24 hours", 1], ["7d", "7 days", 7], ["30d", "30 days", 30], ["90d", "90 days", 90], ["all", "All time", 0]] as const;
const SORTS = [["new", "Newest first"], ["old", "Oldest first"], ["actor", "Person A–Z"], ["action", "Action A–Z"]] as const;
const DAY = 86400000;
const sec = (k: string) => AUDIT_SECTIONS[k] ?? { label: "Other", color: "#8a8f98", like: [] };

/** Stacked bars (one colour per section). Click a bar to zoom the time range to it. */
function Chart({ buckets, unit, onPick }: { buckets: Result["buckets"]; unit: string; onPick: (from: Date, to: Date) => void }) {
  const by = new Map<number, Record<string, number>>();
  for (const b of buckets) { const t = new Date(b.t).getTime(), m = by.get(t) ?? {}, k = sectionOf(b.action); m[k] = (m[k] ?? 0) + b.n; by.set(t, m); }
  if (!by.size) return <p className="sub" style={{ margin: 0 }}>No activity in this range.</p>;
  const step = { hour: 3600000, day: DAY, week: 7 * DAY, month: 31 * DAY }[unit as "day"] ?? DAY;
  const ts = [...by.keys()].sort((a, b) => a - b), t0 = ts[0], t1 = ts[ts.length - 1];
  const slots = unit === "month" ? ts : Array.from({ length: Math.round((t1 - t0) / step) + 1 }, (_, i) => t0 + i * step);
  const tot = (t: number) => Object.values(by.get(t) ?? {}).reduce((a, b) => a + b, 0), max = Math.max(...slots.map(tot));
  const w = 100 / slots.length, H = 90;
  const label = (t: number) => new Date(t).toLocaleString([], unit === "hour" ? { weekday: "short", hour: "numeric" } : { month: "short", day: "numeric", year: unit === "month" ? "numeric" : undefined });
  return (
    <svg viewBox={`0 0 100 ${H + 4}`} preserveAspectRatio="none" width="100%" height="110" role="img" aria-label="Activity over time" style={{ display: "block" }}>
      {slots.map((t, i) => {
        let y = H;
        const m = by.get(t) ?? {};
        return (
          <g key={t} style={{ cursor: "pointer" }} onClick={() => onPick(new Date(t), new Date(unit === "month" ? new Date(t).setMonth(new Date(t).getMonth() + 1) : t + step))}>
            <title>{`${label(t)} · ${tot(t)} change${tot(t) === 1 ? "" : "s"}${Object.entries(m).map(([k, n]) => `\n${sec(k).label}: ${n}`).join("")}`}</title>
            <rect x={i * w} y={0} width={w} height={H + 4} fill="transparent" />
            {Object.entries(m).map(([k, n]) => { const h = (n / max) * H; y -= h; return <rect key={k} x={i * w + w * 0.12} y={y} width={w * 0.76} height={h} fill={sec(k).color} rx={0.4} />; })}
          </g>
        );
      })}
      <line x1={0} x2={100} y1={H + 0.5} y2={H + 0.5} stroke="currentColor" opacity={0.2} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Audit() {
  const [text, setText] = useState(""), [q, setQ] = useState("");
  const [f, setF] = useState<F>({ actors: [], sections: [], actions: [] });
  const [range, setRange] = useState<string>("7d");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [sort, setSort] = useState("new");
  const [res, setRes] = useState<Result | null>(null);
  const [more, setMore] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [n, setN] = useState(0);
  const [focus, setFocus] = useState(false), [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const span = useMemo(() => {
    if (range === "custom") return { from: custom.from ? new Date(custom.from) : null, to: custom.to ? new Date(new Date(custom.to).getTime() + DAY) : null };
    const d = RANGES.find((r) => r[0] === range)![2];
    return { from: d ? new Date(Date.now() - d * DAY) : null, to: null };
  }, [range, custom, n]);
  const days = span.from ? ((span.to?.getTime() ?? Date.now()) - span.from.getTime()) / DAY : 999;
  const unit = days <= 2 ? "hour" : days <= 100 ? "day" : days <= 400 ? "week" : "month";

  const params = (offset = 0) => {
    const p = new URLSearchParams({ q, sort, unit, offset: String(offset) });
    for (const k of ["actors", "sections", "actions"] as const) if (f[k].length) p.set(k.slice(0, -1), f[k].join("\u0001"));
    if (span.from) p.set("from", span.from.toISOString());
    if (span.to) p.set("to", span.to.toISOString());
    return p;
  };
  const key = JSON.stringify([q, f, sort, unit, span.from?.getTime(), span.to?.getTime(), n]);
  useEffect(() => {
    const t = setTimeout(() => fetch(`/api/webmaster/audit?${params()}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((r) => { setRes(r); setMore([]); setErr(""); }).catch(() => setErr("Could not load the log")), 150);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 200); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); input.current?.focus(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);

  // Suggestions while typing: matching people, sections and actions you can turn into filters with one click.
  const t = text.trim().toLowerCase();
  type Sug = { kind: keyof F; v: string; label: string; n?: number };
  const sugs = useMemo<Sug[]>(() => {
    if (!focus) return [];
    const has = (k: keyof F, v: string) => f[k].includes(v), hit = (s: string) => !t || s.toLowerCase().includes(t);
    return [
      ...Object.entries(AUDIT_SECTIONS).filter(([k, s]) => !has("sections", k) && hit(s.label)).map(([k, s]) => ({ kind: "sections" as const, v: k, label: s.label })),
      ...(res?.actors ?? []).filter((a) => !has("actors", a.v) && hit(a.v)).slice(0, 5).map((a) => ({ kind: "actors" as const, v: a.v, label: a.v, n: a.n })),
      ...(res?.actions ?? []).filter((a) => !has("actions", a.v) && hit(a.v + " " + headline(a.v))).slice(0, 6).map((a) => ({ kind: "actions" as const, v: a.v, label: headline(a.v), n: a.n })),
    ].slice(0, 12);
  }, [focus, t, res, f]);
  const pick = (s: Sug) => { setF({ ...f, [s.kind]: [...f[s.kind], s.v] }); setText(""); setQ(""); setHi(0); input.current?.focus(); };
  const drop = (k: keyof F, v: string) => setF({ ...f, [k]: f[k].filter((x) => x !== v) });
  const any = f.actors.length + f.sections.length + f.actions.length + (q ? 1 : 0) + (range !== "7d" ? 1 : 0) > 0;
  const rows = [...(res?.rows ?? []), ...more];
  const secCounts = new Map<string, number>();
  for (const a of res?.actions ?? []) secCounts.set(sectionOf(a.v), (secCounts.get(sectionOf(a.v)) ?? 0) + a.n);

  return (
    <>
      <h1>Audit log</h1>
      <p className="sub">Everything anyone changed in the admin. Press <kbd>/</kbd> to search; pick people, sections and actions from the suggestions, click a bar in the graph to zoom in.</p>

      <div className="aud-bar">
        <div className="aud-search">
          <input ref={input} placeholder="Search people, actions, targets…" aria-label="Search audit log" value={text} autoComplete="off"
            onChange={(e) => { setText(e.target.value); setHi(0); }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((hi + 1) % Math.max(1, sugs.length)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((hi - 1 + sugs.length) % Math.max(1, sugs.length)); }
              else if (e.key === "Enter" && sugs[hi] && text) { e.preventDefault(); pick(sugs[hi]); }
              else if (e.key === "Escape") { setText(""); setFocus(false); }
              else if (e.key === "Backspace" && !text) { const k = (["actions", "actors", "sections"] as const).find((x) => f[x].length); if (k) drop(k, f[k][f[k].length - 1]); }
            }} />
          {sugs.length > 0 && (
            <div className="aud-sug" role="listbox">
              {sugs.map((s, i) => (
                <div key={s.kind + s.v} role="option" aria-selected={i === hi} className={i === hi ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pick(s); }} onMouseEnter={() => setHi(i)}>
                  <span className="tag">{{ sections: "Section", actors: "Person", actions: "Action" }[s.kind]}</span> {s.kind === "sections" && <i className="dot" style={{ background: sec(s.v).color }} />}{s.label}{s.n != null && <span className="tag" style={{ marginLeft: "auto" }}>{s.n}</span>}
                </div>
              ))}
              {text && <div className="hint">Enter picks the highlighted filter · text above searches everything</div>}
            </div>
          )}
        </div>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>

      <div className="aud-bar">
        {RANGES.map(([k, l]) => <button key={k} className={"pill" + (range === k ? " on" : "")} onClick={() => setRange(k)}>{l}</button>)}
        <button className={"pill" + (range === "custom" ? " on" : "")} onClick={() => setRange("custom")}>Custom</button>
        {range === "custom" && (
          <>
            <input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />–
            <input type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </>
        )}
      </div>

      <div className="aud-bar">
        {Object.entries(AUDIT_SECTIONS).map(([k, s]) => (
          <button key={k} className={"pill" + (f.sections.includes(k) ? " on" : "")} aria-pressed={f.sections.includes(k)} onClick={() => (f.sections.includes(k) ? drop("sections", k) : setF({ ...f, sections: [...f.sections, k] }))}>
            <i className="dot" style={{ background: s.color }} />{s.label}{secCounts.has(k) && <span className="tag"> {secCounts.get(k)}</span>}
          </button>
        ))}
      </div>

      {(f.actors.length > 0 || f.actions.length > 0 || q) && (
        <div className="aud-bar">
          {q && <span className="chip">“{q}” <button className="x" aria-label="Clear search" onClick={() => { setText(""); setQ(""); }}>×</button></span>}
          {f.actors.map((v) => <span className="chip" key={v}>👤 {v} <button className="x" aria-label={`Remove ${v}`} onClick={() => drop("actors", v)}>×</button></span>)}
          {f.actions.map((v) => <span className="chip" key={v} title={v}>{headline(v)} <button className="x" aria-label={`Remove ${v}`} onClick={() => drop("actions", v)}>×</button></span>)}
        </div>
      )}

      <div className="card aud-chart">
        <Chart buckets={res?.buckets ?? []} unit={unit} onPick={(from, to) => { setCustom({ from: from.toLocaleDateString("en-CA"), to: new Date(to.getTime() - 1).toLocaleDateString("en-CA") }); setRange("custom"); }} />
        <div className="aud-leg">
          {Object.entries(AUDIT_SECTIONS).map(([k, s]) => <span key={k}><i className="dot" style={{ background: s.color }} />{s.label}</span>)}
          <span className="grow" />
          <span className="tag">{res ? `${res.total.toLocaleString()} change${res.total === 1 ? "" : "s"}` : "Loading…"} · by {unit}</span>
        </div>
      </div>

      {(res?.actors.length ?? 0) > 0 && (
        <div className="aud-bar">
          <span className="tag">People:</span>
          {res!.actors.slice(0, 8).map((a) => <button key={a.v} className={"pill" + (f.actors.includes(a.v) ? " on" : "")} onClick={() => (f.actors.includes(a.v) ? drop("actors", a.v) : setF({ ...f, actors: [...f.actors, a.v] }))}>{a.v} <span className="tag">{a.n}</span></button>)}
        </div>
      )}

      {any && <p><button onClick={() => { setF({ actors: [], sections: [], actions: [] }); setText(""); setQ(""); setRange("7d"); }}>Clear all filters</button></p>}
      {err && <p className="err">{err}</p>}
      <div className="card">
        {rows.map((r) => {
          const s = sec(sectionOf(r.action));
          return (
            <div key={r.id}>
              <div className="row">
                <i className="dot" style={{ background: s.color }} title={s.label} />
                <span className="grow"><b>{headline(r.action)}</b> {r.target}{" "}
                  <button className="link" title="Only this person" onClick={() => !f.actors.includes(r.actor) && setF({ ...f, actors: [...f.actors, r.actor] })}>by {r.actor}</button></span>
                <span className="tag" title={new Date(r.at).toLocaleString()}>{ago(r.at)}</span>
                <button aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide changes" : "Changes"}</button>
              </div>
              {open === r.id && <div style={{ padding: "0 0 12px" }}><Details r={r} onDone={() => { setOpen(null); setN(n + 1); }} /></div>}
            </div>
          );
        })}
        {res && !rows.length && <p className="sub">No entries match.</p>}
        {res && rows.length < res.total && <p><button onClick={() => fetch(`/api/webmaster/audit?${params(rows.length)}`).then((r) => r.json()).then((r) => setMore([...more, ...r.rows])).catch(() => setErr("Could not load more"))}>Show more ({res.total - rows.length} left)</button></p>}
      </div>
    </>
  );
}
