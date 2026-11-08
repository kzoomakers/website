"use client";
import { useEffect, useState } from "react";
import { chores } from "../rpc";
import { awardText, hrs, when } from "../format";

const PERIODS = [["this_week", "This week"], ["this_month", "This month"], ["this_year", "This year"], ["all_time", "All time"]];
const vs = (now: number, before?: number) => (before === undefined ? "" : now === before ? "same as before" : `${now > before ? "+" : ""}${Math.round((now - before) * 10) / 10} vs the same stretch before`);

export default function Stats() {
  const [s, setS] = useState<Record<string, any> | null>(null), [period, setPeriod] = useState("this_month"), [err, setErr] = useState("");
  useEffect(() => { chores("stats").then(setS, (e) => setErr(e.message)); }, []);
  if (err) return <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>;
  if (!s) return <p className="sub">Loading…</p>;
  const p = s[period], max = Math.max(0.1, ...p.timeline.map((t: any) => t.hours)), peak = Math.max(1, ...p.heat.flat());
  const tiles: [string, string, string][] = [["Hours", String(p.hours), vs(p.hours, p.before?.hours)], ["Shifts", String(p.sessions), vs(p.sessions, p.before?.sessions)], ["Volunteers", String(p.volunteers), vs(p.volunteers, p.before?.volunteers)],
    ["On time", p.on_time === null ? "–" : p.on_time + "%", `${p.scored} scheduled visits`], ["Average shift", p.avg_minutes === null ? "–" : p.avg_minutes + " min", ""]];
  return (
    <>
      <h1>Chore stats</h1>
      <nav className="bar">{PERIODS.map(([k, l]) => <button key={k} aria-pressed={period === k} className={period === k ? "primary" : ""} onClick={() => setPeriod(k)}>{l}</button>)}</nav>
      {p.new.length > 0 && <p className="sub">New this period: {p.new.join(", ")}.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {tiles.map(([l, v, sub]) => <div className="card" key={l} style={{ margin: 0 }}><div className="sub" style={{ margin: 0 }}>{l}</div><div style={{ fontSize: 28, fontWeight: 700 }}>{v}</div><div className="sub" style={{ margin: 0, fontSize: 12 }}>{sub}</div></div>)}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Hours over time</h2>
        <div role="img" aria-label="Hours given over the period" style={{ display: "flex", alignItems: "end", gap: 3, height: 120 }}>
          {p.timeline.map((t: any) => <div key={t.label} title={`${t.label}: ${t.hours} h`} style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (t.hours / max) * 100)}%`, background: "var(--acc, #0891b2)", opacity: t.ahead ? 0.2 : 1, borderRadius: 2 }} />)}
        </div>
        <div style={{ display: "flex", gap: 3, fontSize: 10, color: "var(--mut)" }}>{p.timeline.map((t: any) => <span key={t.label} style={{ flex: 1, minWidth: 2, textAlign: "center", overflow: "hidden" }}>{p.timeline.length > 14 && Number.isNaN(+t.label) ? "" : t.label}</span>)}</div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>When the work happens</h2>
        <div role="img" aria-label="Minutes volunteered by weekday and hour" style={{ display: "grid", gridTemplateColumns: "auto repeat(24, 1fr)", gap: 2, alignItems: "center", fontSize: 11 }}>
          {p.heat.map((row: number[], d: number) => [<span key={"l" + d} style={{ paddingRight: 6 }}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]}</span>, ...row.map((m, h) => <span key={d + "-" + h} title={`${m} min`} style={{ height: 14, background: "var(--acc, #0891b2)", opacity: m ? 0.15 + 0.85 * (m / peak) : 0.05, borderRadius: 2 }} />)])}
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Volunteers</h2>
        {p.people.map((m: any) => (
          <div key={m.who} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
            <strong>{m.who}</strong> <span className="tag">{hrs(m.hours)}</span><span className="tag">{m.sessions} shifts</span><span className="tag">{m.tasks} chores</span>
            <span className="tag">Favorite: {m.favorite} ×{m.favorite_times}</span>{m.streak > 1 && <span className="tag">{m.streak} week streak</span>}<span className="tag">Last: {when(m.last_at)}</span>
          </div>
        ))}
        {!p.people.length && <p className="sub">Nobody has logged time in this period.</p>}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Chores</h2>
        {p.tasks.map((t: any) => (
          <div key={t.id} style={{ padding: "6px 0", borderTop: "1px solid var(--line)", opacity: t.active ? 1 : 0.6 }}>
            <strong>{t.name}</strong> <span className="tag">done {t.done}×</span><span className="tag">{hrs(t.hours)}</span>
            {t.on_time !== null && <span className="tag">{t.on_time}% on time</span>}{t.avg_wait ? <span className="tag">waits {t.avg_wait} days past due on average (worst {t.longest_wait})</span> : null}
            {t.top && <span className="tag">Most by {t.top} ×{t.top_times}</span>}{t.due_in !== null && <span className="tag">{t.due_in < 0 ? `${-t.due_in} days overdue` : t.due_in === 0 ? "due today" : `due in ${t.due_in} days`}</span>}
          </div>
        ))}
        {!p.tasks.length && <p className="sub">No chores yet.</p>}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Standouts</h2>
        {p.awards.map((a: any, i: number) => { const [title, text] = awardText(a); return <div key={i} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><span className="tag" style={{ fontWeight: 600 }}>{title}</span> {text}</div>; })}
        {!p.awards.length && <p className="sub">Nothing to celebrate yet.</p>}
      </div>
    </>
  );
}
