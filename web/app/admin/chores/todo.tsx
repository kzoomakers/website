"use client";
import Notice from "@/components/notice";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { chores } from "./rpc";
import { dueText, every, when } from "./format";

type Row = { id: number; name: string; aliases: string[]; every_days: number | null; notes: string; due_at: number | null; overdue_days: number | null; last_done_at: number | null; last_by: string | null; being_done_by: string[] };
const BLANK = { id: 0, name: "", every_days: "", aliases: "", notes: "" };

export default function Todo({ initial, members }: { initial: Row[]; members: { id: number; name: string }[] }) {
  const [rows, setRows] = useState(initial), [form, setForm] = useState(BLANK), [msg, setMsg] = useState(""), [done, setDone] = useState<{ id: number; user: string; minutes: string } | null>(null);
  const load = async () => setRows(await chores("list"));
  const run = async (f: () => Promise<unknown>) => { setMsg(""); try { await f(); await load(); } catch (e: any) { setMsg(e.message); } };
  const save = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await chores("save", { chore: { ...form, id: form.id || undefined } }); setForm(BLANK); }); };
  const edit = (r: Row) => setForm({ id: r.id, name: r.name, every_days: r.every_days ? String(r.every_days) : "", aliases: r.aliases.join(", "), notes: r.notes });
  const del = async (r: Row) => { if (await confirmDialog(`Delete "${r.name}"? The hours people gave to it stay counted.`, { ok: "Delete", danger: true })) run(() => chores("delete", { id: r.id })); };
  const finish = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await chores("logTime", { chore_id: done!.id, user_id: Number(done!.user), minutes: Number(done!.minutes) }); setDone(null); }); };
  return (
    <>
      <h1>Chores</h1>
      <p className="sub">The chores that keep the space running and how often each wants doing. Overdue ones are read out by Computer at the space. Mark one done for a member here, or they can say so out loud.</p>
      {msg && <Notice kind="error">{msg}</Notice>}
      <form className="card" onSubmit={save} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ flex: "2 1 220px" }}>Chore<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} placeholder="clean the bathroom" required style={{ width: "100%" }} /></label>
        <label>Every (days)<input type="number" min={1} max={366} value={form.every_days} onChange={(e) => setForm({ ...form, every_days: e.target.value })} placeholder="as needed" style={{ width: 110 }} /></label>
        <label style={{ flex: "1 1 180px" }}>Other names<input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} placeholder="restroom, loo" style={{ width: "100%" }} /></label>
        <label style={{ flex: "2 1 220px" }}>Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} style={{ width: "100%" }} /></label>
        <button className="pri">{form.id ? "Save chore" : "Add chore"}</button>
        {form.id > 0 && <button type="button" onClick={() => setForm(BLANK)}>Cancel</button>}
      </form>
      <div className="card">
        {rows.map((r) => (
          <div key={r.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
            <strong>{r.name}</strong> <span className="tag">{every(r.every_days)}</span>
            <span className="tag" style={{ color: (r.overdue_days ?? -1) > 0 ? "var(--bad)" : undefined, fontWeight: (r.overdue_days ?? -1) >= 0 ? 600 : 400 }}>{dueText(r)}</span>
            <span className="tag">Last: {r.last_done_at ? `${when(r.last_done_at)} by ${r.last_by}` : "never"}</span>
            {r.being_done_by.length > 0 && <span className="tag" style={{ color: "var(--ok, #1b7f3b)" }}>Being done by {r.being_done_by.join(", ")}</span>}
            {r.notes && <div className="sub" style={{ margin: "4px 0" }}>{r.notes}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <button onClick={() => setDone(done?.id === r.id ? null : { id: r.id, user: "", minutes: "30" })}>Mark done…</button>
              {r.due_at !== null && <button onClick={() => run(() => chores("snooze", { id: r.id, days: 7 }))}>Snooze a week</button>}
              <button onClick={() => edit(r)}>Edit</button>
              <button className="danger" onClick={() => del(r)}>Put away</button>
            </div>
            {done?.id === r.id && (
              <form onSubmit={finish} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginTop: 8 }}>
                <label>Who<select value={done.user} onChange={(e) => setDone({ ...done, user: e.target.value })} required><option value="">Pick a member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                <label>Minutes<input type="number" min={1} max={960} value={done.minutes} onChange={(e) => setDone({ ...done, minutes: e.target.value })} required style={{ width: 90 }} /></label>
                <button className="pri">Log it</button>
              </form>
            )}
          </div>
        ))}
        {!rows.length && <p className="sub">No chores yet. Add the first one above.</p>}
      </div>
    </>
  );
}
