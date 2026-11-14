"use client";
import { useEffect, useState } from "react";
import Notice, { msgKind } from "@/components/notice";
import { promptDialog } from "@/components/dialog";
import { crm } from "../rpc";
import type { Detail, RenewState, Row } from "@/lib/id-card";

type Counts = Record<RenewState, number>;
const TABS: [RenewState, string][] = [["pending", "To review"], ["waiting", "Waiting for member"], ["rejected", "Declined"], ["approved", "Approved"]];
const LABEL: Record<string, string> = { pending: "To review", waiting: "Waiting for member", rejected: "Declined", approved: "Approved" };
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const day = (s: string | null) => (s ? new Date(s + "T12:00:00").toLocaleDateString([], { dateStyle: "medium" }) : "none");

// Replacement IDs waiting for a look. Same conversation thread as the new-member approvals: ask a question and the member answers on their ID page.
export default function Renewals({ initial, canEdit, open }: { initial: { rows: Row[]; counts: Counts }; canEdit: boolean; open?: number }) {
  const [tab, setTab] = useState<RenewState>("pending"), [rows, setRows] = useState(initial.rows), [counts, setCounts] = useState(initial.counts);
  const [sel, setSel] = useState<number | null>(open ?? null), [d, setD] = useState<Detail | null>(null);
  const [text, setText] = useState(""), [err, setErr] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);

  const refresh = async (t = tab) => { const r = await crm<{ rows: Row[]; counts: Counts }>("idRenewals", { state: t }); setRows(r.rows); setCounts(r.counts); };
  const load = (id: number) => crm<Detail>("idRenewal", { id }).then(setD, (e) => setErr(e.message));
  useEffect(() => { if (sel !== null) load(sel); else setD(null); }, [sel]);
  useEffect(() => { refresh().catch((e) => setErr(e.message)); }, [tab]);

  const run = async (op: string, args: Record<string, unknown>, done: string) => {
    setBusy(true); setErr(""); setMsg("");
    try { await crm(op, { id: d!.id, ...args }); setMsg(done); await Promise.all([load(d!.id), refresh()]); return true; }
    catch (e: any) { setErr(e.message); return false; } finally { setBusy(false); }
  };
  const decline = async () => { const r = await promptDialog(`Decline ${d!.name}'s new ID? They are told this reason (be kind and specific):`, "", { multiline: true, ok: "Decline" }); if (r !== null) await run("idDecide", { to: "rejected", reason: r }, "Declined. The member was told."); };
  const live = d && (d.state === "pending" || d.state === "waiting");

  return (
    <section aria-label="ID renewals">
      <h1>ID renewals</h1>
      <p className="sub">Members who sent a new ID. Compare it with the one on file, then approve it, decline it, or ask a question. Every view of an ID is logged. Guests update their IDs themselves at check-in and don't appear here.</p>
      <div className="bar" role="tablist">
        {TABS.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "pri" : ""} onClick={() => { setTab(t); setSel(null); }}>{l}{t === "pending" || t === "waiting" ? ` (${counts[t]})` : ""}</button>)}
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1 1 260px", maxWidth: 340, alignSelf: "flex-start" }}>
          {rows.map((p) => (
            <button key={p.id} onClick={() => setSel(p.id)} aria-pressed={sel === p.id} className="row" style={{ display: "block", width: "100%", textAlign: "left", background: sel === p.id ? "var(--acc-bg)" : "none", border: 0 }}>
              <strong>{p.name}</strong>{p.last_by_member && p.state === "pending" && <span className="tag" style={{ marginLeft: 6 }}>new</span>}
              <div className="sub" style={{ margin: 0 }}>{p.email} · {when(p.last_at ?? p.created_at)}</div>
            </button>
          ))}
          {!rows.length && <p className="sub" style={{ padding: 12 }}>{tab === "pending" ? "All caught up." : "Nobody here."}</p>}
        </div>
        {d && (
          <div className="card" style={{ flex: "2 1 360px", minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>{d.name} <span className="tag">{LABEL[d.state]}</span></h3>
            <p className="sub" style={{ marginTop: 0 }}>{d.email}</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              {([["old", "On file", d.current?.expires_on ?? null], ["new", "New upload", d.expires_on]] as const).map(([side, label, exp]) => (
                <figure key={side} style={{ margin: 0, flex: "1 1 200px" }}>
                  {side === "old" && !d.current ? <p className="sub">No ID on file.</p> : side === "new" && !live
                    ? <p className="sub">The new upload is no longer kept once decided.</p>
                    : <a href={`/api/webmaster/member-file?renewal=${d.id}&side=${side}`} target="_blank" rel="noreferrer"><img alt={`${label} ID of ${d.name}`} src={`/api/webmaster/member-file?renewal=${d.id}&side=${side}`} style={{ width: "100%", aspectRatio: "1.586", objectFit: "contain", background: "#1d1d1f", borderRadius: 8 }} /></a>}
                  <figcaption className="sub" style={{ margin: 0 }}><b>{label}</b> · expires {day(exp)}</figcaption>
                </figure>
              ))}
            </div>
            <ol aria-label="Thread" style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {d.events.map((e) => e.kind === "state"
                ? <li key={e.id} className="sub" style={{ margin: 0, textAlign: "center" }}>{e.actor}: {e.body} · {when(e.at)}</li>
                : <li key={e.id} style={{ justifySelf: e.by_member ? "start" : "end", maxWidth: "88%", padding: "6px 10px", borderRadius: 10, border: e.kind === "note" ? "1px dashed var(--line)" : 0, background: e.kind === "note" ? "none" : e.by_member ? "var(--acc-bg)" : "var(--line)" }}>
                    <small className="sub">{e.kind === "note" ? "🔒 Internal note · " : ""}{e.by_member ? d.name : e.actor} · {when(e.at)}</small>
                    <div style={{ whiteSpace: "pre-wrap" }}>{e.body}</div>
                  </li>)}
            </ol>
            {canEdit && live && <>
              <textarea aria-label="Message or note" rows={3} maxLength={2000} placeholder="Ask the member for more information, or leave a note only staff can see" value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
              <div className="bar">
                <button disabled={busy || !text.trim()} onClick={async () => { if (await run("idSay", { body: text, wait: true }, "Sent. Now waiting for their reply.")) setText(""); }}>Ask for more information</button>
                <button disabled={busy || !text.trim()} onClick={async () => { if (await run("idNote", { body: text }, "Note saved.")) setText(""); }}>Add private note</button>
              </div>
              <div className="bar">
                <button className="pri" disabled={busy} onClick={() => run("idDecide", { to: "approved" }, "Approved. The new ID replaced the old one.")}>Approve</button>
                <button disabled={busy} onClick={decline}>Decline…</button>
              </div>
            </>}
            {msg && <Notice kind={msgKind(msg)}>{msg}</Notice>}
          </div>
        )}
      </div>
    </section>
  );
}
