"use client";
import Notice from "@/components/notice";
import { useState } from "react";
import { confirmDialog, promptDialog } from "@/components/dialog";
import type { Booking, Tab, WalkupRequest } from "@/lib/tours";
import { AdminThread } from "@/components/tour-thread";
import EmailTrail from "./email-trail";
import { tours } from "./rpc";
import MemberActions, { useClasses } from "./member-flow";
import PersonInfo from "./person-info";
import CsvBar from "./csv-bar";
import { TZ } from "@/lib/tours-fmt";
import "./walkups/walkups.css";

const STATUS: [string, string][] = [["booked", "Booked"], ["no_show", "No-show"], ["signed_up", "Signed up"], ["sign_up_later", "Will sign up later"], ["maybe_later", "Maybe later"], ["no_interest", "Not interested"]];
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const time = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
// Built-in views. A booking in a staff-made tab shows only there (and under All tours), so each tab is a to-do list you can clear.
const VIEWS: { key: string; label: string; show: (b: Booking, t: string) => boolean; empty: string }[] = [
  { key: "upcoming", label: "Upcoming", show: (b, t) => !b.tab_id && b.date >= t, empty: "No upcoming tours." },
  { key: "followup", label: "Needs an outcome", show: (b, t) => !b.tab_id && b.date < t && b.status === "booked", empty: "Every past tour has an outcome. 🎉" },
  { key: "all", label: "All tours", show: () => true, empty: "No tours booked yet." },
];

// Same cards, details and member buttons as Walk-ups, so a booked tour and a walk-up request are handled the same way.
export default function Bookings({ initial, tabs: t0, waiting: w0, email }: { initial: Booking[]; tabs: Tab[]; waiting: WalkupRequest[]; email: string }) {
  const [sel, setSel] = useState<number[]>([]), [dest, setDest] = useState(""), [rows, setRows] = useState(initial), [wait, setWait] = useState(w0), [sent, setSent] = useState(0), [tabs, setTabs] = useState(t0), [view, setView] = useState("upcoming"), [q, setQ] = useState(""), [msg, setMsg] = useState(""), classes = useClasses();
  const load = async () => { const [r, t, w] = await Promise.all([tours<Booking[]>("bookings", { past: true }), tours<Tab[]>("tabs"), tours<WalkupRequest[]>("waiting")]); setRows(r); setTabs(t); setWait(w); };
  const run = async (op: string, args: Record<string, unknown>) => { setMsg(""); try { await tours(op, args); await load(); } catch (e: any) { setMsg(e.message); } };
  const cancel = async (b: Booking) => { if (await confirmDialog(`Cancel ${b.name}'s tour? They will be emailed.`, { ok: "Cancel tour", cancelLabel: "Keep tour", danger: true })) run("cancel", { id: b.id }); };
  const addTab = async () => {
    const name = await promptDialog("Name the new tab. For example: Couldn't reach, Call back, Waiting on them.\n\nTours you move into a tab are kept there until you move them out.", "", { ok: "Add tab", title: "New tab" });
    if (name === null) return;
    setMsg(""); try { const t = await tours<Tab>("addTab", { name }); await load(); go("t" + t.id); } catch (e: any) { setMsg(e.message); }
  };
  const renameTab = async (t: Tab) => { const name = await promptDialog("New name for this tab:", t.name, { ok: "Save name", title: "Rename tab" }); if (name !== null) run("renameTab", { id: t.id, name }); };
  const pick = (id: number, on: boolean) => setSel(on ? [...sel, id] : sel.filter((x) => x !== id));
  const go = (key: string) => { setView(key); setSel([]); };
  const delTab = async (t: Tab) => { if (await confirmDialog(`Delete the tab "${t.name}"? No tours are deleted. The ${rows.filter((b) => b.tab_id === t.id).length} tours in it go back to Upcoming or Needs an outcome.`, { ok: "Delete tab", danger: true })) { await run("deleteTab", { id: t.id }); go("upcoming"); } };
  const remind = async (r: WalkupRequest) => {
    if (!(await confirmDialog(`Email ${r.first_name} a reminder to pick a tour time? They get the same links again, without any times that have passed.`, { ok: "Send reminder", title: "Remind " + r.first_name }))) return;
    setMsg(""); setSent(0);
    try { await tours("remind", { id: r.id }); await load(); setSent(r.id); } catch (e: any) { setMsg(e.message); }
  };
  const now = today(), tab = tabs.find((t) => "t" + t.id === view), v = VIEWS.find((x) => x.key === view);
  const inView = (b: Booking) => (tab ? b.tab_id === tab.id : v ? v.show(b, now) : false);
  const needle = q.trim().toLowerCase(), hit = (b: Booking) => !needle || [b.name, b.email, b.phone, b.guide_name].join(" ").toLowerCase().includes(needle);
  const waitList = wait.filter((r) => !needle || [r.first_name, r.last_name, r.email, r.phone].join(" ").toLowerCase().includes(needle));
  const shown = rows.filter(inView), list = view === "waiting" ? [] : needle ? rows.filter(hit) : shown; // searching looks through every tour, whichever tab you are on
  const move = async () => { await run("moveToTab", { ids: sel, tab: dest === "none" ? null : Number(dest) }); setSel([]); setDest(""); };
  const count = (f: (b: Booking) => boolean) => rows.filter(f).length;
  return (
    <>
      <h1>Bookings</h1>
      <p className="sub">Everyone who booked a tour. For each one, say what happened, and sort them into tabs so you can find who still needs a call.</p>
      <div className="wk-tabs" role="tablist" aria-label="Sort tours">
        {VIEWS.slice(0, 1).concat().map((x) => <button key={x.key} role="tab" aria-selected={view === x.key} className={view === x.key ? "on" : ""} onClick={() => go(x.key)}>{x.label} <span>{count((b) => x.show(b, now))}</span></button>)}
        <button role="tab" aria-selected={view === "waiting"} className={view === "waiting" ? "on" : ""} onClick={() => go("waiting")}>Waiting to book <span>{wait.length}</span></button>
        {VIEWS.slice(1).map((x) => <button key={x.key} role="tab" aria-selected={view === x.key} className={view === x.key ? "on" : ""} onClick={() => go(x.key)}>{x.label} <span>{count((b) => x.show(b, now))}</span></button>)}
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={view === "t" + t.id} className={view === "t" + t.id ? "on" : ""} onClick={() => go("t" + t.id)}>{t.name} <span>{count((b) => b.tab_id === t.id)}</span></button>)}
        <button className="wk-plus" onClick={addTab} title="Make a new tab">+ New tab</button>
      </div>
      {!tabs.length && <p className="wk-tip">💡 Tip: press <b>+ New tab</b> to make a tab such as “Couldn't reach”. Then on any tour, use <b>Move to tab</b> to put it there.</p>}
      <div className="wk-toolbar">
        <input className="wk-search" type="search" aria-label="Search tours" placeholder="Search by name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="wk-sp" />
        {tab && <><button onClick={() => renameTab(tab)}>Rename this tab</button><button className="danger" onClick={() => delTab(tab)}>Delete this tab</button></>}
        <CsvBar what="bookings" file="bookings" ops={{ export: "exportBookings", import: "importBookings" }} args={{ past: true }} reload={load} fail={setMsg} />
      </div>
      {needle && <p className="wk-tip">Showing {list.length} of all {rows.length} tours that match “{q.trim()}”.</p>}
      {list.length > 0 && (
        <div className="wk-bulk">
          <label className="wk-check"><input type="checkbox" checked={sel.length === list.length} onChange={(e) => setSel(e.target.checked ? list.map((b) => b.id) : [])} /> Select all {list.length} shown</label>
          {sel.length > 0 && <>
            <b>{sel.length} selected</b>
            <select aria-label="Move the selected tours to" value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">Move them to…</option>
              <option value="none">None (back to the main list)</option>
              {tabs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="pri" disabled={!dest} onClick={move}>Move {sel.length}</button>
            <button onClick={() => setSel([])}>Clear</button>
          </>}
        </div>
      )}
      {msg && <div className="wk-err"><Notice kind="error">{msg}</Notice></div>}
      {view === "waiting" && <p className="wk-tip">These people were emailed tour times but haven't picked one yet. Press <b>Send reminder</b> to email them the choices again.</p>}
      {sent > 0 && view === "waiting" && <div className="wk-err"><Notice kind="success">Reminder sent.</Notice></div>}
      {view === "waiting" && (
        <div className="card wk-list">
          {waitList.map((r) => (
            <div key={r.id} className="wk">
              <div className="wk-head">
                <span className="wk-name">{r.first_name} {r.last_name}</span>
                <span className="wk-status open">Waiting for their reply</span>
                {r.reminded_at && <span className="wk-flag">Reminder sent {new Date(r.reminded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                <span className="wk-when">asked {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{r.guide_name && ` · Guide: ${r.guide_name}`}</span>
              </div>
              <PersonInfo p={r} />
              <ul className="wk-offers">{r.offers.map((o) => <li key={o.date + o.start}>{day(o.date)} · {time(o.start)}–{time(o.end)}</li>)}</ul>
              <div className="wk-actions wk-big">
                <button className="pri" onClick={() => remind(r)}>Send reminder</button>
                <a className="wk-chip" href="/admin/tours/walkups">Change the times…</a>
              </div>
              <AdminThread kind="request" id={r.id} name={r.first_name} msgs={r.msgs} lastFrom={r.last_from} />
            </div>
          ))}
          {!waitList.length && <p className="wk-empty">{needle ? "No one waiting matches that search." : "No one is waiting to pick a time. 🎉"}</p>}
        </div>
      )}
      <div className="card wk-list" hidden={view === "waiting"}>
        {list.map((b) => (
          <div key={b.id} className={"wk" + (b.status === "cancelled" ? " closed" : "")}>
            <div className="wk-head">
              <input type="checkbox" className="wk-pick" aria-label={`Select ${b.name}`} checked={sel.includes(b.id)} onChange={(e) => pick(b.id, e.target.checked)} />
              <span className="wk-name">{b.first_name || b.last_name ? `${b.first_name} ${b.last_name}` : b.name}</span>
              <span className={"wk-status " + (b.activated_at ? "scheduled" : b.status === "cancelled" ? "dismissed" : "open")}>{b.activated_at ? "Activated as a member" : b.status === "cancelled" ? "Cancelled" : STATUS.find(([k]) => k === b.status)?.[1] ?? b.status}</span>
              {b.tab_id && <span className="wk-flag">{tabs.find((t) => t.id === b.tab_id)?.name}</span>}
              <span className="wk-when">{day(b.date)} · {time(b.start_time)}{b.guide_name && ` · Guide: ${b.guide_name}`}</span>
            </div>
            <PersonInfo p={{ ...b, notes: b.visitor_notes }} />
            {b.status !== "cancelled" && (
              <div className="wk-actions wk-big">
                <label className="wk-lbl">What happened with this tour?
                  <select value={b.status} onChange={(e) => run("setStatus", { id: b.id, status: e.target.value })}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </label>
                <label className="wk-lbl">Move to tab
                  <select value={b.tab_id ?? ""} onChange={(e) => run("moveToTab", { id: b.id, tab: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">None (back to the main list)</option>
                    {tabs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <MemberActions p={{ kind: "booking", id: b.id, first: b.first_name || b.name, last: b.last_name, email: b.email, acct: b.acct, activatedAt: b.activated_at, activatedBy: b.activated_by }} classes={classes} me={email} canActivate reload={load} fail={setMsg} />
                <button className="danger" onClick={() => cancel(b)}>Cancel tour</button>
              </div>
            )}
            <EmailTrail email={b.email} />
            <AdminThread kind="booking" id={b.id} name={b.name} msgs={b.msgs} lastFrom={b.last_from} />
          </div>
        ))}
        {!list.length && view !== "waiting" && <p className="wk-empty">{needle ? "No tour matches that search." : tab ? "Nothing in this tab yet. Open a tour and use “Move to tab”." : v?.empty}</p>}
      </div>
    </>
  );
}
