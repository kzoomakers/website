"use client";
import Notice from "@/components/notice";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Booking } from "@/lib/tours";
import { AdminThread } from "@/components/tour-thread";
import { tours } from "./rpc";
import MemberActions, { useClasses } from "./member-flow";
import PersonInfo from "./person-info";
import CsvBar from "./csv-bar";
import "./walkups/walkups.css";

const STATUS: [string, string][] = [["booked", "Booked"], ["no_show", "No-show"], ["signed_up", "Signed up"], ["sign_up_later", "Will sign up later"], ["maybe_later", "Maybe later"], ["no_interest", "Not interested"]];
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const time = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Same cards, details and member buttons as Walk-ups, so a booked tour and a walk-up request are handled the same way.
export default function Bookings({ initial, email }: { initial: Booking[]; email: string }) {
  const [rows, setRows] = useState(initial), [past, setPast] = useState(false), [msg, setMsg] = useState(""), classes = useClasses();
  const load = async (p = past) => { setPast(p); setRows(await tours("bookings", { past: p })); };
  const run = async (op: string, args: Record<string, unknown>) => { setMsg(""); try { await tours(op, args); await load(); } catch (e: any) { setMsg(e.message); } };
  const cancel = async (b: Booking) => { if (await confirmDialog(`Cancel ${b.name}'s tour? They will be emailed.`, { ok: "Cancel tour", cancelLabel: "Keep tour", danger: true })) run("cancel", { id: b.id }); };
  return (
    <>
      <h1>Bookings</h1>
      <p className="sub">People who booked a tour on the website. Set what happened afterwards, activate them as a member if they're ready to join (you can undo it), message the visitor or leave private notes, or cancel a booking (the visitor is emailed).</p>
      <div className="wk-toolbar">
        <label className="wk-check"><input type="checkbox" checked={past} onChange={(e) => load(e.target.checked)} /> Include past tours</label>
        <span className="wk-sp" />
        <CsvBar what="bookings" file="bookings" ops={{ export: "exportBookings", import: "importBookings" }} args={{ past }} reload={load} fail={setMsg} />
      </div>
      {msg && <div className="wk-err"><Notice kind="error">{msg}</Notice></div>}
      <div className="card wk-list">
        {rows.map((b) => (
          <div key={b.id} className={"wk" + (b.status === "cancelled" ? " closed" : "")}>
            <div className="wk-head">
              <span className="wk-name">{b.first_name || b.last_name ? `${b.first_name} ${b.last_name}` : b.name}</span>
              <span className={"wk-status " + (b.activated_at ? "scheduled" : b.status === "cancelled" ? "dismissed" : "open")}>{b.activated_at ? "Activated as a member" : b.status === "cancelled" ? "Cancelled" : STATUS.find(([k]) => k === b.status)?.[1] ?? b.status}</span>
              <span className="wk-when">{day(b.date)} · {time(b.start_time)}{b.guide_name && ` · Guide: ${b.guide_name}`}</span>
            </div>
            <PersonInfo p={{ ...b, notes: b.visitor_notes }} />
            {b.status !== "cancelled" && (
              <div className="wk-actions">
                <select aria-label="Outcome" value={b.status} onChange={(e) => run("setStatus", { id: b.id, status: e.target.value })}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <MemberActions p={{ kind: "booking", id: b.id, first: b.first_name || b.name, last: b.last_name, email: b.email, acct: b.acct, activatedAt: b.activated_at, activatedBy: b.activated_by }} classes={classes} me={email} canActivate reload={load} fail={setMsg} />
                <button className="danger" onClick={() => cancel(b)}>Cancel tour</button>
              </div>
            )}
            <AdminThread kind="booking" id={b.id} name={b.name} msgs={b.msgs} lastFrom={b.last_from} />
          </div>
        ))}
        {!rows.length && <p className="wk-empty">No tours booked yet.</p>}
      </div>
    </>
  );
}
