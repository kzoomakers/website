"use client";
import { useState } from "react";
import Notice from "@/components/notice";
import { confirmDialog } from "@/components/dialog";
import { Changes } from "@/components/agreement";
import { summarize, type Change } from "@/lib/waiver-diff";

type Pending = { id: number; by: string; at: string; changes: Change[] } | null;
type Past = { id: number; at: string; by: string; recipients: number; summary: string; exact: boolean; campaign: number | null; changes: Change[] };
type State = { pending: Pending; subscribers: number; history: Past[] };
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const rpc = async <T,>(op: string, args: object = {}): Promise<T> => {
  const r = await fetch("/api/webmaster/handbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

// Edits to the handbook pile up here. Staff choose what the email says (the automatic list, the exact wording changes, an AI summary) and send it to "Request Handbook Updates".
export default function Updates({ initial, canEdit, ai }: { initial: State; canEdit: boolean; ai: boolean }) {
  const [s, setS] = useState(initial), [summary, setSummary] = useState(""), [exact, setExact] = useState(true), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  const run = async (f: () => Promise<unknown>) => { setMsg(""); setOk(""); setBusy(true); try { await f(); return true; } catch (e: any) { setMsg(e.message); return false; } finally { setBusy(false); } };
  const reload = async () => setS(await rpc<State>("state"));
  const p = s.pending;
  const writeAi = async () => {
    if (summary.trim() && !(await confirmDialog("Replace what you've written with an AI summary?", { ok: "Replace" }))) return;
    await run(async () => { setSummary((await rpc<{ text: string }>("aiSummary", { id: p!.id })).text); setOk("AI wrote a draft. Read it and fix anything before you send."); });
  };
  const send = async () => {
    if (!(await confirmDialog(`Email this update to ${s.subscribers} ${s.subscribers === 1 ? "person" : "people"} on the Request Handbook Updates list?`, { ok: "Send", title: "Send update" }))) return;
    await run(async () => { const r = await rpc<{ sent: number }>("send", { id: p!.id, summary, exact }); setSummary(""); await reload(); setOk(`Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}. It also appears under Email > Emails.`); });
  };
  const skip = async () => {
    if (!(await confirmDialog("Don't email this update? The changes stay recorded, but nobody is told.", { ok: "Don't email", danger: true }))) return;
    await run(async () => { await rpc("skip", { id: p!.id }); await reload(); setOk("Skipped. Nobody was emailed."); });
  };
  return (
    <>
      <h1>Handbook updates</h1>
      <p className="sub">Every handbook edit is recorded here. Members who clicked <b>Notify me by email of updates</b> on the handbook are on the <b>Request Handbook Updates</b> list ({s.subscribers} {s.subscribers === 1 ? "person" : "people"} now). When you're done editing, send them one email about what changed.</p>
      {msg && <Notice kind="error">{msg}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      <section className="card" style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Waiting to be sent</h2>
        {!p ? <p className="sub">Nothing is waiting. Edit the handbook under Website › Guided pages › Handbook and the changes will show up here.</p> : <>
          <p className="sub">Last edited {when(p.at)} by {p.by}. {summarize(p.changes)}</p>
          <details open><summary style={{ cursor: "pointer" }}><b>What changed</b></summary><div style={{ marginTop: 8 }}><Changes changes={p.changes} /></div></details>
          {canEdit && <>
            <label style={{ display: "grid", gap: 4 }}><b>Summary for the email (optional)</b>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} maxLength={3000} placeholder="e.g. - Guests: guests now need to sign in at the front desk." style={{ width: "100%", boxSizing: "border-box" }} />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ai ? <button type="button" className="pri" disabled={busy} onClick={writeAi}>{busy ? "Working…" : "✨ Summarize with AI"}</button> : <span className="sub">Want an AI summary? Choose a service and model for "Member handbook" under <a href="/admin/services/ai">Services › AI</a>.</span>}
              <button type="button" disabled={busy} onClick={() => setSummary(summary || summarize(p.changes))}>Start from the automatic list</button>
            </div>
            <label className="wz-chk" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Include the exact changes (new wording in bold, removed wording struck through)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="pri" disabled={busy || !s.subscribers} onClick={send}>{busy ? "Working…" : `Email ${s.subscribers} ${s.subscribers === 1 ? "person" : "people"}`}</button>
              <button type="button" className="danger" disabled={busy} onClick={skip}>Don't email this</button>
            </div>
            {!s.subscribers && <p className="sub">Nobody has asked for updates yet, so there is no one to email.</p>}
          </>}
        </>}
      </section>
      <section className="card" style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Sent before</h2>
        {!s.history.length && <p className="sub">No updates have been emailed yet.</p>}
        {s.history.map((h) => (
          <details key={h.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <summary style={{ cursor: "pointer" }}><b>{when(h.at)}</b> · {h.recipients} {h.recipients === 1 ? "person" : "people"} · by {h.by} · {summarize(h.changes)}</summary>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {h.summary && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}><b>Summary sent:</b> {h.summary}</p>}
              <p className="sub" style={{ margin: 0 }}>{h.exact ? "Included the exact changes." : "Did not include the exact changes."}{h.campaign ? <> <a href={`/admin/mail/email/${h.campaign}`}>See the email and its stats</a>.</> : null}</p>
              <Changes changes={h.changes} />
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
