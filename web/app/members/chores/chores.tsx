"use client";
import { useCallback, useEffect, useState } from "react";
import { awardText, dueText, every, hrs, measureText, when } from "../../admin/chores/format";

type Chore = { id: number; name: string; every_days: number | null; notes: string; due_at: number | null; overdue_days: number | null; last_done_at: number | null; last_by: string | null; being_done_by: string[] };
type Shift = { id: number; chore: string; started_at: number };
const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/members/chores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const PERIODS = [["this_week", "This week"], ["this_month", "This month"], ["this_year", "This year"], ["all_time", "All time"]];
const TABS = [["todo", "To do"], ["hours", "Hours"], ["fame", "Achievements"], ["stats", "Standouts"]];

// Members see the chores, everyone's hours and achievements, and log their own time.
export default function Chores() {
  const [tab, setTab] = useState("todo"), [period, setPeriod] = useState("this_month"), [msg, setMsg] = useState("");
  const [d, setD] = useState<{ chores: Chore[]; mine: Shift[]; hours: { name: string; hours: number; times: number }[] } | null>(null), [ach, setAch] = useState<any[] | null>(null), [stats, setStats] = useState<any>(null);
  const [log, setLog] = useState<{ id: number; minutes: string } | null>(null);
  const load = useCallback((p = period) => rpc("overview", { period: p }).then(setD, (e) => setMsg(e.message)), [period]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "fame" && !ach) rpc("achievements").then(setAch, (e) => setMsg(e.message)); if (tab === "stats" && !stats) rpc("stats").then(setStats, (e) => setMsg(e.message)); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>) => { setMsg(""); try { await fn(); setAch(null); setStats(null); await load(); if (tab === "fame") rpc("achievements").then(setAch); } catch (e: any) { setMsg(e.message); } };
  const submit = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await rpc("log", { chore_id: log!.id, minutes: Number(log!.minutes) }); setLog(null); }); };
  if (!d) return <p className="sub">{msg || "Loading…"}</p>;
  const sp = stats?.[period === "this_week" || period === "this_month" || period === "this_year" || period === "all_time" ? period : "this_month"];
  return (
    <>
      <p className="sub">The jobs that keep the space running. Start one when you begin and finish it when you're done, or log time you already gave. It counts toward your volunteer hours.</p>
      {msg && <p role="alert" style={{ color: "var(--bad)" }}>{msg}</p>}
      <nav className="bar">{TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} className={tab === k ? "primary" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === "todo" && (
        <>
          {d.mine.length > 0 && (
            <div className="card"><h2 style={{ marginTop: 0 }}>You're on</h2>
              {d.mine.map((s) => <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}><strong>{s.chore}</strong><span className="tag">since {when(s.started_at)}</span><button className="primary" onClick={() => run(() => rpc("finish", { shift_id: s.id }))}>I'm done</button></div>)}
            </div>
          )}
          <div className="card">
            {d.chores.map((c) => (
              <div key={c.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <strong>{c.name}</strong> <span className="tag">{every(c.every_days)}</span>
                <span className="tag" style={{ color: (c.overdue_days ?? -1) > 0 ? "var(--bad)" : undefined, fontWeight: (c.overdue_days ?? -1) >= 0 ? 600 : 400 }}>{dueText(c)}</span>
                <span className="tag">Last: {c.last_done_at ? `${when(c.last_done_at)} by ${c.last_by}` : "never"}</span>
                {c.being_done_by.length > 0 && <span className="tag">Being done by {c.being_done_by.join(", ")}</span>}
                {c.notes && <div className="sub" style={{ margin: "4px 0" }}>{c.notes}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <button onClick={() => run(() => rpc("start", { chore_id: c.id }))}>I'm starting this</button>
                  <button onClick={() => setLog(log?.id === c.id ? null : { id: c.id, minutes: "30" })}>I did this…</button>
                </div>
                {log?.id === c.id && <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 8 }}><label>Minutes<input type="number" min={1} max={960} value={log.minutes} onChange={(e) => setLog({ ...log, minutes: e.target.value })} required style={{ width: 90 }} /></label><button className="primary">Log it</button></form>}
              </div>
            ))}
            {!d.chores.length && <p className="sub">No chores yet.</p>}
          </div>
        </>
      )}
      {tab !== "todo" && tab !== "fame" && <nav className="bar">{PERIODS.map(([k, l]) => <button key={k} aria-pressed={period === k} className={period === k ? "primary" : ""} onClick={() => { setPeriod(k); load(k); }}>{l}</button>)}</nav>}
      {tab === "hours" && (
        <div className="card">
          {d.hours.map((h) => <div key={h.name} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><strong>{h.name}</strong> <span className="tag">{hrs(h.hours)}</span><span className="tag">{h.times} {h.times === 1 ? "time" : "times"}</span></div>)}
          {!d.hours.length && <p className="sub">Nobody has logged time in this period.</p>}
        </div>
      )}
      {tab === "fame" && (
        <div className="card">
          {(ach ?? []).map((a) => (
            <div key={a.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
              <strong>{a.icon} {a.title}</strong> <span className="tag">{a.goal} {measureText(a.measure)}</span><span className="tag">{a.task ?? "any chore"}</span>
              {a.note && <div className="sub" style={{ margin: "4px 0" }}>{a.note}</div>}
              <div style={{ margin: "6px 0" }}>{a.earned.length ? a.earned.map((e: any) => <span className="tag" key={e.who + e.at}>🏆 {e.who} · {when(e.at)}</span>) : <span className="sub">Not earned yet.</span>}</div>
              {a.close.length > 0 && <div className="sub" style={{ margin: 0 }}>Closest: {a.close.map((c: any) => `${c.who} (${c.have})`).join(", ")}</div>}
            </div>
          ))}
          {ach && !ach.length && <p className="sub">No achievements yet.</p>}
          {!ach && <p className="sub">Loading…</p>}
        </div>
      )}
      {tab === "stats" && (
        <div className="card">
          {!sp ? <p className="sub">Loading…</p> : (
            <>
              <p className="sub">{sp.hours} hours over {sp.sessions} shifts by {sp.volunteers} {sp.volunteers === 1 ? "person" : "people"}{sp.on_time !== null && `, ${sp.on_time}% of scheduled chores on time`}.</p>
              {sp.awards.map((a: any, i: number) => { const [t, text] = awardText(a); return <div key={i} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><span className="tag" style={{ fontWeight: 600 }}>{t}</span> {text}</div>; })}
              {!sp.awards.length && <p className="sub">Nothing to celebrate yet.</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
