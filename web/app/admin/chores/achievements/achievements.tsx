"use client";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { chores } from "../rpc";
import { MEASURE_OPTIONS, measureText, when } from "../format";

type A = { id: number; chore_id: number | null; task: string | null; measure: string; goal: number; title: string; icon: string; note: string; earned: { who: string; at: number }[]; close: { who: string; have: number }[] };
const BLANK = { id: 0, chore_id: "", measure: "times", goal: "10", title: "", icon: "", note: "" };

export default function Achievements() {
  const [rows, setRows] = useState<A[]>([]), [list, setList] = useState<{ id: number; name: string }[]>([]), [f, setF] = useState(BLANK), [msg, setMsg] = useState("");
  const load = async () => setRows(await chores("achievements"));
  useEffect(() => { chores("chores").then((c) => setList(c.filter((x: any) => x.active))); load().catch((e) => setMsg(e.message)); }, []);
  const run = async (fn: () => Promise<unknown>) => { setMsg(""); try { await fn(); await load(); } catch (e: any) { setMsg(e.message); } };
  const save = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await chores("saveAchievement", { achievement: { ...f, id: f.id || undefined, chore_id: f.chore_id || null } }); setF(BLANK); }); };
  const del = async (a: A) => { if (await confirmDialog(`Remove "${a.title}"? Nobody loses hours; the title just stops being offered.`, { ok: "Remove", danger: true })) run(() => chores("deleteAchievement", { id: a.id })); };
  return (
    <>
      <h1>Achievements</h1>
      <p className="sub">Set a goal on a chore, or on any chore, and whoever reaches it earns a title. Who has earned each is worked out from the hours log.</p>
      {msg && <p role="alert" style={{ color: "var(--bad)" }}>{msg}</p>}
      <form className="card" onSubmit={save} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label>Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={40} placeholder="Porcelain Knight" required /></label>
        <label>Chore<select value={f.chore_id} onChange={(e) => setF({ ...f, chore_id: e.target.value })}><option value="">Any chore</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Count<select value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })}>{MEASURE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Goal<input type="number" min={1} step="any" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} required style={{ width: 90 }} /></label>
        <label>Icon<input value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} maxLength={20} placeholder="🏅" style={{ width: 70 }} /></label>
        <label style={{ flex: "1 1 200px" }}>Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={200} style={{ width: "100%" }} /></label>
        <button className="primary">{f.id ? "Save" : "Add"}</button>
        {f.id > 0 && <button type="button" onClick={() => setF(BLANK)}>Cancel</button>}
      </form>
      <div className="card">
        {rows.map((a) => (
          <div key={a.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
            <strong>{a.icon} {a.title}</strong> <span className="tag">{a.goal} {measureText(a.measure)}</span><span className="tag">{a.task ?? "any chore"}</span>
            {a.note && <div className="sub" style={{ margin: "4px 0" }}>{a.note}</div>}
            <div style={{ margin: "6px 0" }}>{a.earned.length ? a.earned.map((e) => <span className="tag" key={e.who + e.at}>🏆 {e.who} · {when(e.at)}</span>) : <span className="sub">Not earned yet.</span>}</div>
            {a.close.length > 0 && <div className="sub" style={{ margin: 0 }}>Closest: {a.close.map((c) => `${c.who} (${c.have})`).join(", ")}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => setF({ id: a.id, chore_id: a.chore_id ? String(a.chore_id) : "", measure: a.measure, goal: String(a.goal), title: a.title, icon: a.icon, note: a.note })}>Edit</button>
              <button className="danger" onClick={() => del(a)}>Remove</button>
            </div>
          </div>
        ))}
        {!rows.length && <p className="sub">No achievements yet.</p>}
      </div>
    </>
  );
}
