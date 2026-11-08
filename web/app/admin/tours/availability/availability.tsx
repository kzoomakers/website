"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Block } from "@/lib/tours";
import { tours } from "../rpc";

const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const time = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// A block is a window when a guide is free (e.g. Sat 10:00-12:00, 30-minute tours, 2 people each); the site offers one tour per slot.
export default function Availability({ initial, email, name }: { initial: Block[]; email: string; name: string }) {
  const blank = { id: 0, date: "", start_time: "10:00", end_time: "12:00", slot_minutes: 30, max_per_slot: 1, guide_name: name, guide_email: email };
  const [rows, setRows] = useState(initial), [past, setPast] = useState(false), [f, setF] = useState<typeof blank>(blank), [msg, setMsg] = useState("");
  const load = async (p = past) => { setPast(p); setRows(await tours("blocks", { past: p })); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    try { await tours("saveBlock", { block: { ...f, id: f.id || undefined } }); setF({ ...blank, date: f.date }); await load(); } catch (x: any) { setMsg(x.message); }
  };
  const del = async (b: Block) => {
    if (!(await confirmDialog(b.booked ? `Delete this block? Its ${b.booked} booking(s) will be deleted too, and nobody is emailed.` : "Delete this block?", { ok: "Delete", danger: true }))) return;
    try { await tours("deleteBlock", { id: b.id }); await load(); } catch (x: any) { setMsg(x.message); }
  };
  const set = (k: keyof typeof blank, v: string) => setF({ ...f, [k]: typeof blank[k] === "number" ? Number(v) : v });
  return (
    <>
      <h1>Tour availability</h1>
      <p className="sub">When a guide can give tours. The block is cut into tours of the length you choose, and visitors pick one on the Tours page. Guides get an email for each booking.</p>
      <form className="card" onSubmit={save} style={{ padding: 16, marginBottom: 16, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <label>Date<input type="date" required value={f.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label>From<input type="time" required value={f.start_time} onChange={(e) => set("start_time", e.target.value)} /></label>
        <label>Until<input type="time" required value={f.end_time} onChange={(e) => set("end_time", e.target.value)} /></label>
        <label>Tour length (min)<input type="number" min={5} max={480} required value={f.slot_minutes} onChange={(e) => set("slot_minutes", e.target.value)} /></label>
        <label>People per tour<input type="number" min={1} max={50} required value={f.max_per_slot} onChange={(e) => set("max_per_slot", e.target.value)} /></label>
        <label>Guide name<input value={f.guide_name} maxLength={100} onChange={(e) => set("guide_name", e.target.value)} /></label>
        <label>Guide email<input type="email" value={f.guide_email} maxLength={200} onChange={(e) => set("guide_email", e.target.value)} /></label>
        <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
          <button className="pri">{f.id ? "Save changes" : "Add availability"}</button>
          {f.id ? <button type="button" onClick={() => setF(blank)}>Cancel</button> : null}
        </div>
      </form>
      <nav className="bar">
        <label><input type="checkbox" checked={past} onChange={(e) => load(e.target.checked)} /> Include past blocks</label>
        {msg && <span className="sub" role="alert" style={{ margin: 0 }}>{msg}</span>}
      </nav>
      <div className="card">
        {rows.map((b) => (
          <div key={b.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong>{day(b.date)} · {time(b.start_time)}–{time(b.end_time)}</strong>
            <span className="tag">{b.slot_minutes} min tours, {b.max_per_slot} per tour</span>
            <span className="tag">{b.booked} booked</span>
            {b.guide_name && <span className="tag">Guide: {b.guide_name}</span>}
            <span style={{ marginLeft: "auto" }}><button onClick={() => { setF({ ...b }); scrollTo({ top: 0 }); }}>Edit</button> <button className="danger" onClick={() => del(b)}>Delete</button></span>
          </div>
        ))}
        {!rows.length && <p className="sub">No availability yet. Add a block above and the Tours page will start taking bookings.</p>}
      </div>
    </>
  );
}
