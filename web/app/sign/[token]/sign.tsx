"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/dialog";
import PdfPages from "@/components/pdf-pages";
import SignPad from "@/components/sign-pad";

const DONE: Record<string, string> = { signed: "Thank you, you're done. Everyone involved gets the finished PDF by email once it is complete.", declined: "You declined to sign.", complete: "This document already has all the signatures it needs.", void: "This document was cancelled.", expired: "This document is past its due date." };
type F = { id: number; type: string; page: number; x: number; y: number; w: number; h: number; label: string; options: string[]; required: boolean };
const post = (body: object) => fetch("/api/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function Sign({ token, name, role, fields, pdf, redirect, gate, state }: { token: string; name: string; role: string; fields: F[]; pdf: boolean; redirect: string; gate: { pw: boolean; code: boolean } | null; state: string }) {
  const router = useRouter(), [s, setS] = useState(state), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [no, setNo] = useState(false), [reason, setReason] = useState("");
  const [vals, setVals] = useState<Record<number, string>>({}), [pw, setPw] = useState(""), [code, setCode] = useState(""), [sent, setSent] = useState(false);
  useEffect(() => { if (s === "signed" && redirect) { const t = setTimeout(() => { location.href = redirect; }, 1500); return () => clearTimeout(t); } }, [s, redirect]);
  const call = async (body: object, ok: () => void) => { setBusy(true); setErr(""); const r = await post({ token, ...body }); setBusy(false); if (r.ok) ok(); else setErr(await r.text()); };

  if (gate) return (
    <form className="card" style={{ display: "grid", gap: 10, maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); call({ action: "unlock", password: pw, code }, () => router.refresh()); }}>
      <strong>Please verify it's you</strong>
      {gate.pw && <label>Password (the sender gave it to you)<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" required style={{ width: "100%", boxSizing: "border-box" }} /></label>}
      {gate.code && <>
        <button type="button" disabled={busy} onClick={() => call({ action: "code" }, () => setSent(true))}>{sent ? "Send another code" : "Email me a code"}</button>
        {sent && <p className="sub" style={{ margin: 0 }}>We emailed a 6-digit code to you.</p>}
        <label>Code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required style={{ width: 120 }} /></label>
      </>}
      {err && <p role="alert" style={{ color: "#b00020", margin: 0 }}>{err}</p>}
      <button className="pri" disabled={busy}>Continue</button>
    </form>
  );
  if (s !== "open") return <p role="status" className="card">{DONE[s] ?? DONE.void}{s === "signed" && redirect ? " Taking you on…" : ""}</p>;

  const set = (id: number, v: string) => setVals((o) => ({ ...o, [id]: v }));
  const box = (f: F) => ({ position: "absolute" as const, left: f.x + "%", top: f.y + "%", width: f.w + "%", height: f.h + "%", boxSizing: "border-box" as const, lineHeight: "normal", fontSize: 13 });
  const overlay = (page: number) => fields.filter((f) => f.page === page).map((f) => {
    const t = f.type, hint = f.label || t;
    if (t === "text") return <input key={f.id} value={vals[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} placeholder={hint} aria-label={hint} maxLength={500} style={{ ...box(f), border: "1.5px solid #2563eb", background: "#dbeafe99", padding: "0 3px" }} />;
    if (t === "dropdown") return <select key={f.id} value={vals[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} aria-label={hint} style={{ ...box(f), border: "1.5px solid #2563eb", background: "#dbeafe" }}><option value="">{hint}</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>;
    if (t === "checkbox") return <input key={f.id} type="checkbox" checked={vals[f.id] === "true"} onChange={(e) => set(f.id, e.target.checked ? "true" : "")} aria-label={hint} style={{ ...box(f), margin: 0, accentColor: "#2563eb" }} />;
    const auto = t === "date" ? new Date().toLocaleDateString() : t === "name" ? name : t === "email" ? "(your email)" : t === "signature" ? "✍ Sign below" : "Initials";
    return <div key={f.id} style={{ ...box(f), border: "1.5px dashed #2563eb", background: "#dbeafe66", color: "#1e3a8a", display: "flex", alignItems: "center", padding: "0 3px", overflow: "hidden", whiteSpace: "nowrap" }}>{auto}</div>;
  });
  const submit = (signature: string, drawn: string, initials: string) => call({ action: "sign", signature, drawn, initials, values: vals }, () => setS("signed"));
  return (
    <>
      {pdf && <><p className="sub" style={{ margin: 0 }}>{fields.some((f) => !["signature", "initials", "date", "name", "email"].includes(f.type)) ? "Fill in the highlighted boxes on the document, then " : ""}{role === "viewer" ? "confirm below that you've read it." : "sign below."}</p><PdfPages src={`/api/sign/pdf?token=${token}`} overlay={overlay} /></>}
      {role === "viewer"
        ? <p><button className="pri" disabled={busy} onClick={() => call({ action: "sign" }, () => setS("signed"))}>I've read this document</button></p>
        : <SignPad name={name} busy={busy} label={role === "approver" ? "Approve" : "Sign"} initials={fields.some((f) => f.type === "initials")} onSign={submit} />}
      {err && <p role="alert" style={{ color: "#b00020" }}>{err}</p>}
      {role !== "viewer" && (no ? <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await confirmDialog("Decline to sign this document? This can't be undone.", { ok: "Yes, decline", danger: true })) call({ action: "decline", reason }, () => setS("declined")); }}><label>Reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required style={{ width: "100%" }} /></label><button disabled={busy}>Decline</button></form>
        : <p><button type="button" onClick={() => setNo(true)}>I can't {role === "approver" ? "approve" : "sign"} this</button></p>)}
    </>
  );
}
