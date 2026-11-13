"use client";
import Notice, { msgKind } from "@/components/notice";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Offer, WalkupRequest } from "@/lib/tours";
import { queueOrder, tabOf } from "@/lib/tours-fmt";
import { AdminThread } from "@/components/tour-thread";
import { tours } from "../rpc";
import MemberActions, { useClasses } from "../member-flow";
import PersonInfo from "../person-info";
import CsvBar from "../csv-bar";
import "./walkups.css";

const ago = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const nextWeek = (d: string) => (d ? new Date(new Date(d + "T12:00:00").getTime() + 7 * 864e5).toISOString().slice(0, 10) : "");
const TABS = [["waiting", "Waiting"], ["later", "Maybe later"], ["no", "Not interested"]] as const;
const SAID: Record<string, string> = { interested: "still interested", not_now: "not right now", not_interested: "not interested", unsubscribed: "unsubscribed" };
type Preview = { ready: boolean; people: { id: number; name: string; email: string }[] };
const blank: Offer = { date: "", start: "10:00", end: "11:00" };

// Walk-ups: people who asked for a tour because none was open. Offer 1-5 times; they pick one (it lands in Bookings) or send it back here.
export default function Walkups({ initial, email, name }: { initial: WalkupRequest[]; email: string; name: string }) {
  const [rows, setRows] = useState(initial), [all, setAll] = useState(false), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const classes = useClasses();
  const [tab, setTab] = useState<"waiting" | "later" | "no">("waiting"), [latest, setLatest] = useState(false), [pv, setPv] = useState<Preview | null>(null), [skip, setSkip] = useState<number[]>([]);
  useEffect(() => { try { setLatest(localStorage.getItem("walkups:latest") === "1"); } catch {} }, []);
  const flip = () => { setLatest(!latest); try { localStorage.setItem("walkups:latest", latest ? "0" : "1"); } catch {} };
  const today = new Date().toLocaleDateString("sv-SE"), inTab = rows.filter((r) => tabOf(r, today) === tab);
  // Waiting: people who confirmed come first; only requests still needing times are re-ordered, offered ones follow.
  const shown = tab === "waiting" ? [...queueOrder(inTab.filter((r) => r.status === "open"), latest), ...inTab.filter((r) => r.status !== "open")] : inTab;
  const waiting = rows.filter((r) => r.status === "open" && tabOf(r, today) === "waiting");
  const counts = { waiting: waiting.length, confirmed: waiting.filter((r) => r.first_confirmed).length, quiet: waiting.filter((r) => r.checkins.length && !r.checkins.some((c) => c.answered_at)).length };
  const openPreview = async () => { setMsg(""); try { setPv(await tours("checkinPreview")); setSkip([]); } catch (e: any) { setMsg(e.message); } };
  const sendAll = async () => { if (!pv) return; setBusy(true); try { const r = await tours("checkinSend", { ids: pv.people.map((p) => p.id).filter((i) => !skip.includes(i)) }); setPv(null); setMsg(`Sent ${r.sent} check-in${r.sent === 1 ? "" : "s"}${r.failed ? `. ${r.failed} failed to send.` : "."}`); await load(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const [open, setOpen] = useState(0),[offers, setOffers] = useState<Offer[]>([blank]), [g, setG] = useState({ guide_name: name, guide_email: email });
  const load = async (a = all) => { setAll(a); setRows(await tours("requests", { all: a })); };
  const run = async (fn: () => Promise<unknown>) => { setMsg(""); setBusy(true); try { await fn(); await load(); return true; } catch (e: any) { setMsg(e.message); return false; } finally { setBusy(false); } };
  const who = (r: WalkupRequest) => ({ kind: "request" as const, id: r.id, first: r.first_name, last: r.last_name, email: r.email, acct: r.acct, activatedAt: r.activated_at, activatedBy: r.activated_by });
  const start = (r: WalkupRequest) => { setOpen(r.id); setMsg(""); setOffers(r.offers.length ? r.offers : [blank]); };
  const edit = (i: number, k: keyof Offer, v: string) => setOffers(offers.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const add = () => { const l = offers[offers.length - 1]; setOffers([...offers, { ...l, date: nextWeek(l.date) }]); };
  const send = async (r: WalkupRequest) => { if (await run(() => tours("offer", { id: r.id, offers, ...g }))) setOpen(0); };
  const close = async (r: WalkupRequest) => { if (await confirmDialog(`Dismiss ${r.first_name} ${r.last_name}'s request? They will not be emailed.`, { ok: "Dismiss", danger: true })) run(() => tours("close", { id: r.id })); };
  const takeBack = async (r: WalkupRequest) => { if (await confirmDialog(`Take back the offer to ${r.first_name}? Their emailed links stop working and the request returns to the queue.`, { ok: "Take back" })) run(() => tours("reopen", { id: r.id })); };
  return (
    <>
      <h1>Walk-ups</h1>
      <p className="sub">People who asked for a tour when no time was open. Click <b>Offer times</b>, add the dates and time blocks you could give a tour, and we email them the choices. When they pick one, it appears under Bookings. If none work, the request comes back here.</p>
      <div className="wk-toolbar">
        <label className="wk-check"><input type="checkbox" checked={all} onChange={(e) => load(e.target.checked)} /> Include scheduled, dismissed and activated</label>
        <span className="wk-sp" />
        <CsvBar what="walk-ups" file="walkups" ops={{ export: "exportRequests", import: "import" }} args={{ all }} reload={load} fail={setMsg} />
      </div>
      {msg && <div className="wk-err"><Notice kind={msgKind(msg)}>{msg}</Notice></div>}
      <div className="wk-toolbar">
        {TABS.map(([k, t]) => <button key={k} className={tab === k ? "pri" : ""} aria-pressed={tab === k} onClick={() => setTab(k)}>{t} ({rows.filter((r) => tabOf(r, today) === k).length})</button>)}
        <span className="wk-sp" />
        <span className="sub" style={{ margin: 0 }}>{counts.waiting} waiting · {counts.confirmed} confirmed · {counts.quiet} never answered</span>
      </div>
      {tab === "waiting" && (
        <div className="wk-toolbar">
          <button onClick={openPreview}>Check in with everyone waiting</button>
          <button onClick={flip} aria-label="Change how confirmed people are ordered">Confirmed first: {latest ? "latest" : "earliest"} confirmation</button>
        </div>
      )}
      {pv && (
        <div className="card wk-form" style={{ marginBottom: 16 }}>
          <h3>Ask {pv.people.length - skip.length} of {pv.people.length} waiting if they are still interested?</h3>
          <p className="wk-note">Skipped automatically: asked in the last 7 days, not interested, not right now (until their date), and dismissed requests. Untick anyone you'd rather leave out.</p>
          {!pv.ready && <Notice kind="error">Email isn't set up yet, so check-ins can't be sent. An admin can fix this under Services.</Notice>}
          {pv.people.map((p) => <label key={p.id} className="wk-check" style={{ display: "block" }}><input type="checkbox" checked={!skip.includes(p.id)} onChange={(e) => setSkip(e.target.checked ? skip.filter((i) => i !== p.id) : [...skip, p.id])} /> {p.name} <small>{p.email}</small></label>)}
          {!pv.people.length && <p>No one needs a check-in right now.</p>}
          <div className="wk-actions">
            <button className="pri" disabled={busy || !pv.ready || pv.people.length === skip.length} onClick={sendAll}>{busy ? "Sending…" : "Send check-ins"}</button>
            <button onClick={() => setPv(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="card wk-list">
        {shown.map((r) => (
          <div key={r.id} className={"wk" + (r.status === "closed" || r.status === "dismissed" ? " closed" : "")}>
            <div className="wk-head">
              <span className="wk-name">{r.first_name} {r.last_name}</span>
              <span className={"wk-status " + (r.activated_at ? "scheduled" : r.status)}>{r.activated_at ? "Activated as a member" : r.status === "open" ? "Needs times" : r.status === "offered" ? "Waiting for their reply" : r.status === "scheduled" ? "Scheduled" : "Dismissed"}</span>
              {r.reschedules > 0 && <span className="wk-flag">Asked for new times {r.reschedules} time{r.reschedules > 1 ? "s" : ""} before</span>}
              <span className="wk-when">requested {ago(r.created_at)}</span>
            </div>
            <PersonInfo p={r} />
            {r.first_confirmed && <div className="wk-line"><b>Confirmed interest</b> {ago(r.first_confirmed)}{r.checkins.filter((c) => c.answer === "interested").length > 1 && `, and again ${r.checkins.filter((c) => c.answer === "interested").length - 1} time(s), last ${ago(r.last_confirmed!)}`}</div>}
            {r.snooze_until && r.interest_state === "not_now" && <div className="wk-line"><b>Check back</b> {r.snooze_until}</div>}
            {r.checkins.length > 0 && <div className="wk-line"><b>Check-ins</b> {r.checkins.map((c) => `${ago(c.sent_at)}: ${c.answered_at ? `${SAID[c.answer ?? ""] ?? c.answer} (${ago(c.answered_at)})` : "no reply"}`).join(" · ")}{r.checkins.filter((c) => !c.answered_at).length >= 2 && <span className="wk-flag">Gone quiet</span>}</div>}
            {r.decline_note && r.status === "open" && <div className="wk-line"><b>Last reply</b> “{r.decline_note}”</div>}
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
            ) : r.status === "open" && tab !== "waiting" ? (
              <div className="wk-actions">{r.interest_state === "unsubscribed" ? <span className="wk-flag">Unsubscribed: do not email about tours</span> : <button className="pri" onClick={() => run(() => tours("reopen", { id: r.id }))}>Back to waiting</button>}<button className="danger" onClick={() => close(r)}>Dismiss</button></div>
            ) : r.status === "open" || r.status === "offered" ? (
              <div className="wk-actions">
                <button className="pri" onClick={() => start(r)}>{r.status === "offered" ? "Change times" : "Offer times"}</button>
                <MemberActions p={who(r)} classes={classes} me={email} canActivate reload={load} fail={setMsg} />
                {r.status === "offered" && <button onClick={() => takeBack(r)}>Take back</button>}
                <button className="danger" onClick={() => close(r)}>Dismiss</button>
              </div>
            ) : r.activated_at ? (
              <div className="wk-actions"><MemberActions p={who(r)} classes={classes} me={email} canActivate={false} reload={load} fail={setMsg} /></div>
            ) : null}
            <AdminThread kind="request" id={r.id} name={r.first_name} msgs={r.msgs} lastFrom={r.last_from} />
          </div>
        ))}
        {!shown.length && <p className="wk-empty">{tab === "waiting" ? "No one is waiting for a tour. 🎉" : "No one here."}</p>}
      </div>
    </>
  );
}
