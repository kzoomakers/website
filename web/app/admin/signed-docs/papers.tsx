"use client";
import { useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Doc } from "@/lib/sign";
import { board } from "./rpc";

const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const STATUS: Record<string, string> = { open: "Waiting for signatures", complete: "Signed", void: "Voided", expired: "Past due" };

export default function Papers({ initial, buckets, tags, sealed }: { sealed: boolean; initial: Doc[]; buckets: { id: number; name: string; n: number }[]; tags: string[] }) {
  const [rows, setRows] = useState(initial), [f, setF] = useState({ bucket: "", tag: "", status: "", q: "" }), [msg, setMsg] = useState(""), [openId, setOpenId] = useState<number | null>(null);
  const fr = useRef(f); fr.current = f;
  const load = async (n = f) => { setF(n); setRows(await board("list", n)); };
  // Live view: refresh every few seconds while the tab is open, so signatures appear as they happen.
  const [live, setLive] = useState(new Date());
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) board("list", fr.current).then((r) => { setRows(r); setLive(new Date()); }).catch(() => {}); }, 4000); return () => clearInterval(t); }, []);
  const run = async (op: string, args: Record<string, unknown>, ok = "") => { setMsg(""); try { const r = await board(op, args); await load(); setMsg(op === "remind" ? `Reminder sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}.` : ok); } catch (e: any) { setMsg(e.message); } };
  const send = async (doc: number, signer: number, copy: boolean) => {
    setMsg("");
    try { const r = await board("send", { id: doc, signer, copy }); if (copy) { await navigator.clipboard.writeText(r.link); setMsg("Link copied. It's personal to that person and replaces any earlier link they had."); } else setMsg("Link emailed."); await load(); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <h1>Documents <small className="sub" style={{ fontSize: 12 }} title="Updates every few seconds">● live · {live.toLocaleTimeString()}</small></h1>
      <p className="sub">Resolutions, minutes and agreements collected with e-signatures. <a href="/admin/signed-docs/new">Start a new document</a>. {sealed ? "Finished PDFs carry a digital certificate signature." : "No digital certificate is configured, so finished PDFs are hashed and encrypted but not cryptographically signed (add one on the Services page)."}</p>
      <nav className="bar">
        <select value={f.bucket} onChange={(e) => load({ ...f, bucket: e.target.value })} aria-label="Folder"><option value="">All folders</option>{buckets.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.n})</option>)}</select>
        <select value={f.tag} onChange={(e) => load({ ...f, tag: e.target.value })} aria-label="Tag"><option value="">All tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={f.status} onChange={(e) => load({ ...f, status: e.target.value })} aria-label="Status"><option value="">Any status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="search" placeholder="Search titles" value={f.q} onChange={(e) => load({ ...f, q: e.target.value })} />
        {msg && <span role="status" className="sub" style={{ margin: 0 }}>{msg}</span>}
      </nav>
      <div className="card">
        {rows.map((d) => {
          const signed = d.signers.filter((s) => s.signed_at).length, need = d.needed || d.signers.length;
          return (
            <div key={d.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
              <button onClick={() => setOpenId(openId === d.id ? null : d.id)} style={{ all: "unset", cursor: "pointer", fontWeight: 600 }}>{d.title}</button>{" "}
              <span className="tag">{STATUS[d.status]}</span><span className="tag">{signed}/{need} signed</span>{d.bucket && <span className="tag">📁 {d.bucket}</span>}{d.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
              {openId === d.id && (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <div className="sub" style={{ margin: 0 }}>Created {when(d.created_at)} by {d.created_by}{d.due_at ? ` · due ${when(d.due_at)}` : ""}{d.completed_at ? ` · completed ${when(d.completed_at)}` : ""}{d.needed ? ` · needs ${d.needed} of ${d.signers.length}` : " · everyone must sign"}</div>
                  {d.present.length > 0 && <div className="sub" style={{ margin: 0 }}>Present: {d.present.join(", ")}</div>}
                  <ul style={{ margin: 0 }}>{d.signers.map((s) => <li key={s.id}>{d.sequential ? `${s.ord}. ` : ""}{s.name} ({s.email}, {s.role}{s.has_pw ? ", password" : ""}{s.verify_email ? ", email code" : ""}): {s.role === "cc" ? "gets the finished copy" : s.signed_at ? `✅ ${s.role === "viewer" ? "read" : s.role === "approver" ? "approved" : "signed"} ${when(s.signed_at)}` : s.declined_at ? `declined${s.decline_reason ? `: ${s.decline_reason}` : ""}` : s.viewed_at ? `👀 opened ${when(s.viewed_at)}, not signed yet` : s.sent_at ? `emailed ${when(s.sent_at)}` : d.sequential ? "waiting for earlier people" : "not emailed"}{d.status === "open" && s.role !== "cc" && !s.signed_at && !s.declined_at && <> <button onClick={() => send(d.id, s.id, false)}>{s.sent_at ? "Resend link" : "Email link"}</button> <button onClick={() => send(d.id, s.id, true)}>Copy link</button></>}</li>)}</ul>
                  {d.has_pdf ? <div className="sub" style={{ margin: 0 }}>Uploaded PDF with placed fields.</div> : <details><summary>Document text</summary><pre style={{ whiteSpace: "pre-wrap" }}>{d.body}</pre></details>}
                  <div className="bar">
                    {d.status === "complete" && <a className="pri" href={`/api/webmaster/member-file?pdf=${d.id}`}>Download signed PDF</a>}
                    {(d.status === "open" || d.status === "expired") && <button onClick={() => run("remind", { id: d.id })} disabled={d.status !== "open"}>Send reminder</button>}
                    {d.status === "open" && <button onClick={async () => { if (await confirmDialog(`Void "${d.title}"? Signing links stop working.`, { ok: "Void", danger: true })) run("void", { id: d.id }, "Voided."); }}>Void</button>}
                    {(d.status === "open" || d.status === "expired") && <label className="sub" style={{ margin: 0 }}>Due <input type="date" defaultValue={d.due_at?.slice(0, 10) ?? ""} onChange={(e) => run("due", { id: d.id, due: e.target.value }, "Due date saved.")} /></label>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!rows.length && <p className="sub">No documents match.</p>}
      </div>
    </>
  );
}
