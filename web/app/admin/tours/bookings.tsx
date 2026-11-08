"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Booking } from "@/lib/tours";
import { AdminThread } from "@/components/tour-thread";
import { tours } from "./rpc";

const STATUS: [string, string][] = [["booked", "Booked"], ["no_show", "No-show"], ["signed_up", "Signed up"], ["sign_up_later", "Will sign up later"], ["maybe_later", "Maybe later"], ["no_interest", "Not interested"]];
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const time = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function Bookings({ initial }: { initial: Booking[] }) {
  const [rows, setRows] = useState(initial), [past, setPast] = useState(false), [msg, setMsg] = useState("");
  const load = async (p = past) => { setPast(p); setRows(await tours("bookings", { past: p })); };
  const run = async (op: string, args: Record<string, unknown>) => { setMsg(""); try { await tours(op, args); await load(); } catch (e: any) { setMsg(e.message); } };
  const cancel = async (b: Booking) => { if (await confirmDialog(`Cancel ${b.name}'s tour? They will be emailed.`, { ok: "Cancel tour", cancelLabel: "Keep tour", danger: true })) run("cancel", { id: b.id }); };
  return (
    <>
      <h1>Bookings</h1>
      <p className="sub">People who booked a tour on the website. Set what happened afterwards, message the visitor or leave private notes, or cancel a booking (the visitor is emailed).</p>
      <nav className="bar">
        <label><input type="checkbox" checked={past} onChange={(e) => load(e.target.checked)} /> Include past tours</label>
        {msg && <span className="sub" role="alert" style={{ margin: 0 }}>{msg}</span>}
      </nav>
      <div className="card">
        {rows.map((b) => (
          <div key={b.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)", opacity: b.status === "cancelled" ? 0.55 : 1 }}>
            <strong>{day(b.date)} · {time(b.start_time)}</strong> <span className="tag">{b.name}</span>
            <a className="tag" href={`mailto:${b.email}`}>{b.email}</a><a className="tag" href={`tel:${b.phone}`}>{b.phone}</a>
            {b.guide_name && <span className="tag">Guide: {b.guide_name}</span>}
            {(b.interest || b.heard) && <div className="sub" style={{ margin: "4px 0" }}>{b.interest && `Interested in: ${b.interest}. `}{b.heard && `Heard about us: ${b.heard}.`}</div>}
            {(b.client_ip || b.user_agent || b.screen) && <div className="sub" style={{ margin: "4px 0", fontSize: 12 }}>Device: {[b.client_ip, b.screen, b.user_agent].filter(Boolean).join(" · ")}</div>}
            {b.visitor_notes && <div className="sub" style={{ margin: "4px 0" }}>Visitor's notes: {b.visitor_notes}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              {b.status === "cancelled" ? <span className="tag" style={{ fontWeight: 600 }}>Cancelled</span> : (
                <>
                  <select aria-label="Outcome" value={b.status} onChange={(e) => run("setStatus", { id: b.id, status: e.target.value })}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <button className="danger" onClick={() => cancel(b)}>Cancel tour</button>
                </>
              )}
            </div>
            <AdminThread kind="booking" id={b.id} name={b.name} msgs={b.msgs} lastFrom={b.last_from} />
          </div>
        ))}
        {!rows.length && <p className="sub">No tours booked yet.</p>}
      </div>
    </>
  );
}
