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
  const [rows, setRows] = useState(initial), [past, setPast] = useState(false), [f, setF] = useState<typeof blank>(blank), [msg, setMsg] = useState(""), [q, setQ] = useState(""), [mine, setMine] = useState(false);
  const load = async (p = past) => { setPast(p); setRows(await tours("blocks", { past: p })); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    try { await tours("saveBlock", { block: { ...f, id: f.id || undefined } }); setF({ ...blank, date: f.date }); await load(); } catch (x: any) { setMsg(x.message); }
  };
  const now = new Date().toLocaleString("sv-SE").slice(0, 16); // browser clock; shortcut: assumes volunteers are in the space's time zone
  const shown = rows.filter((b) => (!mine || b.guide_email === email) && (day(b.date) + " " + b.guide_name).toLowerCase().includes(q.trim().toLowerCase())), upcoming = shown.filter((b) => `${b.date} ${b.end_time}` >= now);
  const PLEA = "Please do this as sparingly as possible. Cancelled tours often mean lost members, and that hurts the revenue our nonprofit depends on.";
  // Deleting cancels everyone booked; spell out the cost first. They are emailed a link to rebook (or to request a tour if nothing is open).
  const remove = async (list: Block[], what: string) => {
    const people = list.reduce((n, b) => n + b.future, 0);
    const msg = people
      ? `Delete ${what}?\n\n⚠ ${people} ${people === 1 ? "person is" : "people are"} booked and will be cancelled. ${people === 1 ? "They'll" : "They'll each"} be emailed and asked to rebook.\n\n${PLEA}`
      : `Delete ${what}?\n\nNo upcoming tour is booked, so no one will be notified.`;
    if (!(await confirmDialog(msg, { ok: people ? `Cancel ${people} ${people === 1 ? "tour" : "tours"} and delete` : "Delete", danger: true }))) return;
    try { const r = await tours("deleteBlocks", { ids: list.map((b) => b.id) }); await load(); setMsg(r.people ? `Deleted. ${r.people} ${r.people === 1 ? "person was" : "people were"} emailed to rebook.` : "Deleted."); } catch (x: any) { setMsg(x.message); }
  };
  const set = (k: keyof typeof blank, v: string) => setF({ ...f, [k]: typeof blank[k] === "number" ? Number(v) : v });
  return (
    <>
      <h1>Availability</h1>
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
        <input type="search" aria-label="Find a block" placeholder="Find a block: date or guide name" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <label><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine</label>
        <label><input type="checkbox" checked={past} onChange={(e) => load(e.target.checked)} /> Include past blocks</label>
        {upcoming.length > 0 && <button className="danger" onClick={() => remove(upcoming, upcoming.length === 1 ? "this upcoming block" : `all ${upcoming.length} upcoming blocks shown`)}>{q || mine ? `Delete the ${upcoming.length} upcoming shown…` : "Delete all upcoming blocks…"}</button>}
        {msg && <span className="sub" role="alert" style={{ margin: 0 }}>{msg}</span>}
      </nav>
      <div className="card">
        {shown.map((b) => (
          <div key={b.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong>{day(b.date)} · {time(b.start_time)}–{time(b.end_time)}</strong>
            <span className="tag">{b.slot_minutes} min tours, {b.max_per_slot} per tour</span>
            <span className="tag">{b.booked} booked</span>
            {b.guide_name && <span className="tag">Guide: {b.guide_name}</span>}
            <span style={{ marginLeft: "auto" }}><button onClick={() => { setF({ ...b }); scrollTo({ top: 0 }); }}>Edit</button> <button className="danger" onClick={() => remove([b], `${day(b.date)} · ${time(b.start_time)}–${time(b.end_time)}`)}>Delete</button></span>
          </div>
        ))}
        {!shown.length && <p className="sub">{rows.length ? "No blocks match." : "No availability yet. Add a block above and the Tours page will start taking bookings."}</p>}
      </div>
    </>
  );
}
