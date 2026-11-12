"use client";
import Notice from "@/components/notice";
import { useRef, useState } from "react";
import { alertDialog, confirmDialog } from "@/components/dialog";
import type { Offer, WalkupRequest } from "@/lib/tours";
import { AdminThread } from "@/components/tour-thread";
import { tours } from "../rpc";
import "./walkups.css";

const ago = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const nextWeek = (d: string) => (d ? new Date(new Date(d + "T12:00:00").getTime() + 7 * 864e5).toISOString().slice(0, 10) : "");
const blank: Offer = { date: "", start: "10:00", end: "11:00" };

// Walk-ups: people who asked for a tour because none was open. Offer 1-5 times; they pick one (it lands in Bookings) or send it back here.
export default function Walkups({ initial, email, name }: { initial: WalkupRequest[]; email: string; name: string }) {
  const [rows, setRows] = useState(initial), [all, setAll] = useState(false), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(0),[offers, setOffers] = useState<Offer[]>([blank]), [g, setG] = useState({ guide_name: name, guide_email: email });
  const load = async (a = all) => { setAll(a); setRows(await tours("requests", { all: a })); };
  const run = async (fn: () => Promise<unknown>) => { setMsg(""); setBusy(true); try { await fn(); await load(); return true; } catch (e: any) { setMsg(e.message); return false; } finally { setBusy(false); } };
  const upload = async (f?: File) => { if (!f) return; setMsg(""); setBusy(true); try { const j = await tours("import", { csv: await f.text() }); await load(); await alertDialog(`Added ${j.added} request${j.added === 1 ? "" : "s"}${j.dupes ? `; ${j.dupes} already here` : ""}.${j.skipped.length ? ` Skipped ${j.skipped.length} without a valid name, email or time: ${j.skipped.join("; ")}` : ""}`); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const exportCsv = async () => {
    setMsg("");
    try { const { csv } = await tours("exportRequests", { all }); const u = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = u; a.download = `walkups-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
    catch (e: any) { setMsg(e.message); }
  };
  const start = (r: WalkupRequest) => { setOpen(r.id); setMsg(""); setOffers(r.offers.length ? r.offers : [blank]); };
  const edit = (i: number, k: keyof Offer, v: string) => setOffers(offers.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const add = () => { const l = offers[offers.length - 1]; setOffers([...offers, { ...l, date: nextWeek(l.date) }]); };
  const send = async (r: WalkupRequest) => { if (await run(() => tours("offer", { id: r.id, offers, ...g }))) setOpen(0); };
  const close = async (r: WalkupRequest) => { if (await confirmDialog(`Dismiss ${r.first_name} ${r.last_name}'s request? They will not be emailed.`, { ok: "Dismiss", danger: true })) run(() => tours("close", { id: r.id })); };
  const takeBack = async (r: WalkupRequest) => { if (await confirmDialog(`Take back the offer to ${r.first_name}? Their emailed links stop working and the request returns to the queue.`, { ok: "Take back" })) run(() => tours("reopen", { id: r.id })); };
  const activate = async (r: WalkupRequest) => {
    if (!(await confirmDialog(`Activate ${r.first_name} ${r.last_name} now? This approves ${r.email} as a member right away, emails them a sign-in link to sign the membership agreement, read the handbook and upload an ID, and takes this request off the list.`, { ok: "Activate now", title: "Activate now" }))) return;
    setMsg(""); setBusy(true);
    try { const j = await tours("activate", { id: r.id }); await load(); await alertDialog(j.emailed ? `${r.first_name} is activated. The sign-in link was emailed to ${r.email}.` : `${r.first_name} is activated, but the email could not be sent. Have them sign in with ${r.email} on the sign-in page; the agreement will be waiting.`); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <h1>Walk-ups</h1>
      <p className="sub">People who asked for a tour when no time was open. Click <b>Offer times</b>, add the dates and time blocks you could give a tour, and we email them the choices. When they pick one, it appears under Bookings. If none work, the request comes back here.</p>
      <div className="wk-toolbar">
        <label className="wk-check"><input type="checkbox" checked={all} onChange={(e) => load(e.target.checked)} /> Include scheduled and dismissed</label>
        <span className="wk-sp" />
        <button onClick={exportCsv}>Export CSV</button>
        <button disabled={busy} onClick={() => fileRef.current?.click()}>Import CSV…</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {msg && <div className="wk-err"><Notice kind="error">{msg}</Notice></div>}
      <div className="card wk-list">
        {rows.map((r) => (
          <div key={r.id} className={"wk" + (r.status === "closed" || r.status === "dismissed" ? " closed" : "")}>
            <div className="wk-head">
              <span className="wk-name">{r.first_name} {r.last_name}</span>
              <span className={"wk-status " + r.status}>{r.status === "open" ? "Needs times" : r.status === "offered" ? "Waiting for their reply" : r.status === "scheduled" ? "Scheduled" : "Dismissed"}</span>
              {r.reschedules > 0 && <span className="wk-flag">Asked for new times {r.reschedules} time{r.reschedules > 1 ? "s" : ""} before</span>}
              <span className="wk-when">requested {ago(r.created_at)}</span>
            </div>
            <div className="wk-contact">
              <a className="wk-chip" href={`mailto:${r.email}`}>{r.email}</a>
              <a className="wk-chip" href={`tel:${r.phone}`}>{r.phone}</a>
              <span className="wk-chip">Zip {r.zip}</span>
              <span className="wk-chip">Prefers {r.contact_method}</span>
            </div>
            {r.interest && <div className="wk-line"><b>Interested in</b> {r.interest}</div>}
            {r.notes && <div className="wk-line"><b>Notes</b> {r.notes}</div>}
            {r.decline_note && r.status === "open" && <div className="wk-line"><b>Last reply</b> “{r.decline_note}”</div>}
            {(r.client_ip || r.user_agent || r.screen) && <div className="wk-line wk-meta">Device: {[r.client_ip, r.screen, r.user_agent].filter(Boolean).join(" · ")}</div>}
            {r.status === "offered" && <ul className="wk-offers">{r.offers.map((o) => <li key={o.date + o.start}>{o.date} {o.start}–{o.end}</li>)}</ul>}
            {open === r.id ? (
              <div className="wk-form">
                <h3>Which times could you give a tour?</h3>
                {offers.map((o, i) => (
                  <div key={i} className="wk-slot">
                    <label>Date<input type="date" required value={o.date} onChange={(e) => edit(i, "date", e.target.value)} /></label>
                    <label>From<input type="time" required value={o.start} onChange={(e) => edit(i, "start", e.target.value)} /></label>
                    <label>Until<input type="time" required value={o.end} onChange={(e) => edit(i, "end", e.target.value)} /></label>
                    {offers.length > 1 && <button type="button" aria-label="Remove this time" onClick={() => setOffers(offers.filter((_, j) => j !== i))}>✕</button>}
                  </div>
                ))}
                {offers.length < 5 && <button type="button" onClick={add}>+ Add another time</button>}
                <div className="wk-fields">
                  <label>Your name<input value={g.guide_name} maxLength={100} onChange={(e) => setG({ ...g, guide_name: e.target.value })} /></label>
                  <label>Your email <small>(gets the confirmation)</small><input type="email" required value={g.guide_email} maxLength={200} onChange={(e) => setG({ ...g, guide_email: e.target.value })} /></label>
                </div>
                <div className="wk-actions">
                  <button className="pri" disabled={busy} onClick={() => send(r)}>{busy ? "Sending…" : `Email these times to ${r.first_name}`}</button>
                  <button type="button" onClick={() => setOpen(0)}>Cancel</button>
                </div>
                <p className="wk-note">Times are in Kalamazoo time. They get one link per time, plus a link to ask for different ones.</p>
              </div>
            ) : r.status === "open" || r.status === "offered" ? (
              <div className="wk-actions">
                <button className="pri" onClick={() => start(r)}>{r.status === "offered" ? "Change times" : "Offer times"}</button>
                <button disabled={busy} onClick={() => activate(r)}>Activate now</button>
                {r.status === "offered" && <button onClick={() => takeBack(r)}>Take back</button>}
                <button className="danger" onClick={() => close(r)}>Dismiss</button>
              </div>
            ) : null}
            <AdminThread kind="request" id={r.id} name={r.first_name} msgs={r.msgs} lastFrom={r.last_from} />
          </div>
        ))}
        {!rows.length && <p className="wk-empty">No one is waiting for a tour. 🎉</p>}
      </div>
    </>
  );
}
