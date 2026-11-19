"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MODAL_TEXT, REASONS, type PiiKind, type Subject } from "@/lib/pii-shared";

// "Retrieve info": a button that asks for a reason (after the confidentiality warning) and fetches the data from /api/pii/retrieve.
// The data lives only in the caller's state, so it is gone when the person navigates away or presses Hide. Nothing sensitive is ever in the page itself.
const CSS = `dialog.pii{border:0;border-radius:14px;padding:0;max-width:480px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.35);color:#1a1a1a;background:#fff;color-scheme:light;font:15px/1.45 system-ui,sans-serif}
@media (prefers-color-scheme:dark){dialog.pii{color:#e8eaed;background:#1a1d21;color-scheme:dark}dialog.pii select,dialog.pii textarea{background:#111316;color:#e8eaed}}
dialog.pii::backdrop{background:rgba(0,0,0,.45)}dialog.pii form{padding:20px 24px;display:grid;gap:12px}dialog.pii p{margin:0}
dialog.pii select,dialog.pii textarea{width:100%;box-sizing:border-box;padding:8px 10px;font:inherit;border:1px solid #767676;border-radius:8px}
dialog.pii .bar{display:flex;justify-content:flex-end;gap:8px}dialog.pii button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #767676;background:transparent;color:inherit;cursor:pointer}
dialog.pii button.go{background:#2563eb;border-color:#2563eb;color:#fff}dialog.pii button:disabled{opacity:.5;cursor:not-allowed}dialog.pii .err{color:#c62828}`;

export function PiiModal({ kind, subject, onData, onClose }: { kind: PiiKind; subject: Pick<Subject, "type" | "id"> & Partial<Subject>; onData: (d: any) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  const ok = !!reason && (reason !== "other" || note.trim().length >= 3);
  const go = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/pii/retrieve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, subject, reason, note }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r ? await r.text() : "Network error. Nothing was shown.");
    onData(await r.json());
    onClose();
  };
  // Portaled to <body>: inside a form it would submit that form too (React bubbles submit through portals, hence stopPropagation) and inside a disabled fieldset its controls would be dead.
  return createPortal(<dialog ref={ref} className="pii" aria-labelledby="pii-t" onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <style>{CSS}</style>
    <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (ok && !busy) go(); }}>
      <h2 id="pii-t" style={{ margin: 0, fontSize: 18 }}>{MODAL_TEXT[0]}</h2>
      <p>{MODAL_TEXT[1]}</p><p>{MODAL_TEXT[2]}</p>
      <label>Reason<select autoFocus required value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose a reason…</option>{Object.entries(REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Note {reason === "other" ? "(required)" : "(optional)"}<textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="bar"><button type="button" onClick={onClose}>Cancel</button><button className="go" disabled={!ok || busy}>I understand, show it</button></div>
    </form>
  </dialog>, document.body);
}

/** A "Retrieve info" button. While `data` is set it shows `children(data)` and a Hide button instead. */
export default function PiiButton({ kind, subject, label = "Retrieve info", children, onChange }: { kind: PiiKind; subject: Pick<Subject, "type" | "id"> & Partial<Subject>; label?: string; children: (data: any) => ReactNode; onChange?: (data: any | null) => void }) {
  const [data, setData] = useState<any>(null), [ask, setAsk] = useState(false);
  const set = (d: any) => { setData(d); onChange?.(d); };
  return <>
    {data ? <><div>{children(data)}</div><button type="button" onClick={() => set(null)}>Hide</button></> : <button type="button" onClick={() => setAsk(true)}>🔒 {label}</button>}
    {ask && <PiiModal kind={kind} subject={subject} onData={set} onClose={() => setAsk(false)} />}
  </>;
}

/** A link-style button for a document: asks for a reason, then downloads the PDF straight away (nothing stays on the page). */
export function PiiDownload({ subject, label }: { subject: Pick<Subject, "type" | "id"> & Partial<Subject>; label: string }) {
  const [ask, setAsk] = useState(false);
  const save = (d: { pdf: string; title: string }) => { const a = document.createElement("a"); a.href = d.pdf; a.download = d.title.replace(/[^\w.-]+/g, "_").slice(0, 60) + ".pdf"; a.click(); };
  return <><button type="button" className="linkish" onClick={() => setAsk(true)} style={{ background: "none", border: 0, padding: 0, color: "var(--acc, #2563eb)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>🔒 {label}</button>{ask && <PiiModal kind="signed_doc" subject={subject} onData={save} onClose={() => setAsk(false)} />}</>;
}
