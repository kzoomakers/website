"use client";
import { useEffect, useState } from "react";
import { confirmDialog, promptDialog } from "@/components/dialog";
import { chores } from "../rpc";
import { hrs, when } from "../format";

type Entry = { id: number; chore: string; user_id: number | null; owner_name: string; started_at: number; ended_at: number | null; minutes: number | null; how: string; source: string };
const PERIODS = [["today", "Today"], ["this_week", "This week"], ["this_month", "This month"], ["this_year", "This year"], ["all_time", "All time"]];

export default function Log() {
  const [log, setLog] = useState<Entry[]>([]), [list, setList] = useState<{ id: number; name: string }[]>([]), [people, setPeople] = useState<{ id: number; name: string }[]>([]);
  const [totals, setTotals] = useState<{ name: string; hours: number; times: number }[]>([]), [period, setPeriod] = useState("this_month"), [msg, setMsg] = useState("");
  const [f, setF] = useState({ chore_id: "", user_id: "", minutes: "30", date: "" });
  const load = async (p = period) => { const [l, t] = await Promise.all([chores("log"), chores("hours", { period: p })]); setLog(l); setTotals(t); };
  useEffect(() => { Promise.all([chores("chores"), chores("members")]).then(([c, m]) => { setList(c.filter((x: any) => x.active)); setPeople(m); }); load().catch((e) => setMsg(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>) => { setMsg(""); try { await fn(); await load(); } catch (e: any) { setMsg(e.message); } };
  const add = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await chores("logTime", { chore_id: Number(f.chore_id), user_id: Number(f.user_id), minutes: Number(f.minutes), date: f.date || undefined }); setF({ ...f, minutes: "30", date: "" }); }); };
  const end = async (x: Entry) => { const m = await promptDialog(`Minutes ${x.owner_name} spent on ${x.chore} (leave empty for the time since they started)`, "", { ok: "Finish" }); if (m !== null) run(() => chores("finish", { id: x.id, minutes: m.trim() })); };
  const del = async (x: Entry) => { if (await confirmDialog(`Delete this entry for ${x.owner_name}?`, { ok: "Delete", danger: true })) run(() => chores("deleteLog", { id: x.id })); };
  return (
    <>
      <h1>Hours log</h1>
      <p className="sub">The time members give to chores. Computer logs it when someone says they're starting or done; you can type in time here too.</p>
      {msg && <p role="alert" style={{ color: "var(--bad)" }}>{msg}</p>}
      <form className="card" onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label>Chore<select value={f.chore_id} onChange={(e) => setF({ ...f, chore_id: e.target.value })} required><option value="">Pick a chore</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Who<select value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} required><option value="">Pick a member</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>Minutes<input type="number" min={1} max={960} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} required style={{ width: 90 }} /></label>
        <label>Day<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <button className="primary">Log time</button>
      </form>
      <nav className="bar">
        {PERIODS.map(([k, l]) => <button key={k} aria-pressed={period === k} className={period === k ? "primary" : ""} onClick={() => { setPeriod(k); load(k); }}>{l}</button>)}
      </nav>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Hours by member</h2>
        {totals.map((t) => <div key={t.name} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><strong>{t.name}</strong> <span className="tag">{hrs(t.hours)}</span><span className="tag">{t.times} {t.times === 1 ? "time" : "times"}</span></div>)}
        {!totals.length && <p className="sub">Nobody has logged time in this period.</p>}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Entries</h2>
        {log.map((x) => (
          <div key={x.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <strong>{x.owner_name || "Someone"}</strong> <span>{x.chore}</span>
            <span className="tag">{x.ended_at ? hrs(Math.round(((x.minutes ?? 0) / 60) * 10) / 10) : "in progress"}</span>
            <span className="tag">{when(x.started_at)}</span><span className="tag">{x.how}{x.source && ` · ${x.source}`}</span>
            <span style={{ flex: 1 }} />
            {!x.ended_at && <button onClick={() => end(x)}>Finish</button>}
            <button className="danger" onClick={() => del(x)}>Delete</button>
          </div>
        ))}
        {!log.length && <p className="sub">Nothing logged yet.</p>}
      </div>
    </>
  );
}
