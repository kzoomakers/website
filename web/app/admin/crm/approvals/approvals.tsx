"use client";
import { useEffect, useState } from "react";
import { alertDialog, promptDialog } from "@/components/dialog";
import { crm } from "../rpc";
import type { Detail, Row, State } from "@/lib/approvals";

type Counts = Record<State, number>;
const TABS: [State, string][] = [["pending", "To review"], ["waiting", "Waiting for applicant"], ["rejected", "Declined"], ["approved", "Approved"]];
const LABEL: Record<string, string> = { pending: "To review", waiting: "Waiting for applicant", rejected: "Declined", approved: "Approved" };
// UX: most replies are one of a few questions, so one click drops the wording in (still editable).
const CANNED = ["Could you confirm your full name as you'd like it to appear?", "What would you like to make or learn at the space?", "Is there a phone number we can reach you at?"];

const ago = (iso: string) => { const m = Math.max(0, (Date.now() - +new Date(iso)) / 60000); return m < 60 ? `${Math.floor(m)}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// The sign-up approval queue: who is waiting, the conversation with them, and the moves between states. Shared by the CRM and Admin pages.
export default function Approvals({ initial, canEdit, open, compact }: { initial: { rows: Row[]; counts: Counts }; canEdit: boolean; open?: number; compact?: boolean }) {
  const [tab, setTab] = useState<State>("pending"), [rows, setRows] = useState(initial.rows), [counts, setCounts] = useState(initial.counts);
  const [sel, setSel] = useState<number | null>(open ?? null), [d, setD] = useState<Detail | null>(null);
  const [text, setText] = useState(""), [err, setErr] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ first_name: string; last_name: string; phone: string; ok: boolean } | null>(null);

  const refresh = async (t = tab) => { const r = await crm<{ rows: Row[]; counts: Counts }>("applicants", { state: t }); setRows(r.rows); setCounts(r.counts); };
  const load = (id: number) => crm<Detail>("applicant", { id }).then((x) => { setD(x); setReview(null); }, (e) => setErr(e.message));
  useEffect(() => { if (sel !== null) load(sel); else setD(null); }, [sel]);
  useEffect(() => { refresh().catch((e) => setErr(e.message)); }, [tab]);

  // Runs one change: shows the error if it fails, otherwise reloads the list and thread.
  const run = async (op: string, args: Record<string, unknown>, done = "") => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await crm<{ emailed?: boolean }>(op, { id: d!.id, ...args });
      setMsg(r.emailed === false && op !== "applicantNote" && args.to !== "pending" && args.to !== "waiting" ? `${done} (their email couldn't be sent: check the mail Settings)` : done);
      await Promise.all([load(d!.id), refresh()]);
      return true;
    } catch (e: any) { setErr(e.message); return false; } finally { setBusy(false); }
  };
  const send = async (wait: boolean) => { if (await run("applicantSay", { body: text, wait }, wait ? "Sent. Now waiting for their reply." : "Sent.")) setText(""); };
  const move = async (to: State) => {
    if (to === "approved") return setReview({ first_name: d!.first_name, last_name: d!.last_name, phone: d!.phone, ok: false });
    let reason = "";
    if (to === "rejected") { const r = await promptDialog(`Reject ${d!.name}? They are emailed and shown this reason (optional, be kind and specific):`, "", { multiline: true, ok: "Reject" }); if (r === null) return; reason = r; }
    await run("applicantMove", { from: d!.approval, to, reason }, `Moved to ${LABEL[to]}.`);
  };

  const list = (
    <div className="card" style={{ flex: "1 1 260px", maxWidth: 340, alignSelf: "flex-start" }}>
      {rows.map((p) => (
        <button key={p.id} onClick={() => setSel(p.id)} aria-pressed={sel === p.id} className="row" style={{ display: "block", width: "100%", textAlign: "left", background: sel === p.id ? "var(--acc-bg)" : "none", border: 0 }}>
          <strong>{p.name}</strong>{p.last_by_applicant && p.last_at !== p.applied_at && <span className="tag" style={{ marginLeft: 6 }}>replied</span>}
          <div className="sub" style={{ margin: 0 }}>{p.email} · {tab === "pending" || tab === "waiting" ? `last activity ${ago(p.last_at)} ago` : when(p.last_at)}</div>
        </button>
      ))}
      {!rows.length && <p className="sub" style={{ padding: 12 }}>{tab === "pending" ? "All caught up. Nobody is waiting on us." : "Nobody here."}</p>}
    </div>
  );

  return (
    <section aria-label="Sign-up approvals">
      {compact ? <h2>New members waiting for approval ({counts.pending + counts.waiting})</h2> : <><h1>New members</h1><p className="sub">People who signed up and verified their email. They can't use the members area until someone approves them. Ask a question and they can reply right here; every message and change is recorded with who made it.</p></>}
      <div className="bar" role="tablist">
        {TABS.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "pri" : ""} onClick={() => { setTab(t); setSel(null); }}>{l}{t !== "approved" ? ` (${counts[t]})` : ""}</button>)}
      </div>
      {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {list}
        {d && (
          <div className="card" style={{ flex: "2 1 360px", minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>{d.name} <span className="tag">{LABEL[d.approval]}</span></h3>
            <p className="sub" style={{ marginTop: 0 }}>{d.email}{d.phone ? ` · ${d.phone}` : " · no phone yet"}{d.address ? ` · ${d.address}` : ""}</p>
            {d.approval === "approved" && <p className="sub" style={{ marginTop: 0 }}>Onboarding: {d.onboarding === "done" ? "complete" : `waiting on ${d.onboarding}`} · {d.waiver_id ? <a href={`/api/webmaster/member-file?pdf=${d.waiver_id}`}>Signed waiver (PDF)</a> : "no waiver yet"} · {d.has_id ? <a href={`/api/webmaster/member-file?id=${d.id}`} target="_blank" rel="noreferrer">View photo ID (logged)</a> : "no ID yet"}</p>}
            <ol aria-label="Thread" style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
              {d.events.map((e) => e.kind === "state"
                ? <li key={e.id} className="sub" style={{ margin: 0, textAlign: "center" }}>{e.by_applicant && e.to_state === "pending" && e.body === "Applied for membership" ? "Applied" : e.by_applicant ? "They replied: back to Pending" : `${e.actor} moved to ${LABEL[e.to_state ?? ""]}`} · {when(e.at)}{e.body && !e.by_applicant ? <em> · {e.body}</em> : null}</li>
                : <li key={e.id} style={{ justifySelf: e.by_applicant ? "start" : "end", maxWidth: "88%", padding: "6px 10px", borderRadius: 10, border: e.kind === "note" ? "1px dashed var(--line)" : 0, background: e.kind === "note" ? "none" : e.by_applicant ? "var(--acc-bg)" : "var(--line)" }}>
                    <small className="sub">{e.kind === "note" ? "🔒 Internal note · " : ""}{e.by_applicant ? d.name : e.actor} · {when(e.at)}</small>
                    <div style={{ whiteSpace: "pre-wrap" }}>{e.body}</div>
                  </li>)}
            </ol>
            {canEdit && d.approval !== "approved" && (
              <>
                <div className="bar">{CANNED.map((c) => <button key={c} type="button" onClick={() => setText((t) => (t ? t + "\n" : "") + c)}>+ {c.slice(0, 28)}…</button>)}</div>
                <textarea aria-label="Message or note" rows={3} maxLength={2000} placeholder="Write to them, or leave a note only staff can see" value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
                <div className="bar">
                  <button className="pri" disabled={busy || !text.trim()} onClick={() => send(true)} title="Emails them and moves to Waiting until they reply">Send &amp; wait for reply</button>
                  <button disabled={busy || !text.trim()} onClick={() => send(false)}>Send</button>
                  <button disabled={busy || !text.trim()} onClick={async () => { if (await run("applicantNote", { body: text }, "Note saved.")) setText(""); }}>Add private note</button>
                </div>
              </>
            )}
            {canEdit && (
              <div className="bar" aria-label="Change state">
                <span className="sub">Move to:</span>
                {(["pending", "waiting", "rejected", "approved"] as State[]).filter((s) => s !== d.approval).map((s) => <button key={s} disabled={busy} className={s === "approved" ? "pri" : ""} onClick={() => move(s)}>{s === "approved" ? "Approve…" : s === "rejected" ? "Reject…" : LABEL[s]}</button>)}
              </div>
            )}
            {review && (
              <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (e) => { e.preventDefault(); if (await run("applicantMove", { from: d.approval, to: "approved", confirmed: true, edit: { first_name: review.first_name, last_name: review.last_name, phone: review.phone } }, "Approved. They've been emailed.")) setReview(null); }}>
                <strong>Check before approving</strong>
                <div className="sub" style={{ margin: 0 }}>Fix anything that looks wrong. Email ({d.email}) was verified by their sign-in link. On first sign-in they'll be asked for address, phone and an emergency contact.</div>
                <label>First name<input required value={review.first_name} onChange={(e) => setReview({ ...review, first_name: e.target.value })} /></label>
                <label>Last name<input value={review.last_name} onChange={(e) => setReview({ ...review, last_name: e.target.value })} /></label>
                <label>Phone<input type="tel" value={review.phone} onChange={(e) => setReview({ ...review, phone: e.target.value })} /></label>
                <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={review.ok} onChange={(e) => setReview({ ...review, ok: e.target.checked })} /> I've checked their name and contact details are right</label>
                <div className="bar"><button className="pri" type="submit" disabled={busy || !review.ok}>Approve {review.first_name}</button><button type="button" onClick={() => setReview(null)}>Cancel</button></div>
              </form>
            )}
            {msg && <p role="status" className="sub">{msg}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
