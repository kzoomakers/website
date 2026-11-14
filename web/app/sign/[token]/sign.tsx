"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/dialog";
import PdfPages from "@/components/pdf-pages";
import SignPad from "@/components/sign-pad";

const DONE: Record<string, string> = { signed: "Thank you, you're done. Everyone involved gets the finished PDF by email once it is complete.", declined: "You declined to sign.", complete: "This document already has all the signatures it needs.", void: "This document was cancelled.", expired: "This document is past its due date." };
type F = { id: number; type: string; page: number; x: number; y: number; w: number; h: number; label: string; options: string[]; required: boolean; prefs?: { def?: string; ro?: boolean; align?: string; size?: number; key?: string; cells?: number; cond?: { key: string; op: "eq" | "neq" | "filled"; val?: string } } };
const post = (body: object) => fetch("/api/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function Sign({ token, name, role, fields, pdf, redirect, gate, state }: { token: string; name: string; role: string; fields: F[]; pdf: boolean; redirect: string; gate: { pw: boolean; code: boolean } | null; state: string }) {
  const router = useRouter(), [s, setS] = useState(state), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [no, setNo] = useState(false), [reason, setReason] = useState("");
  const [vals, setVals] = useState<Record<string, string>>(() => { // pre-filled values, then whatever this person had typed before closing the tab
    const o: Record<string, string> = Object.fromEntries(fields.filter((f) => f.prefs?.def).map((f) => [f.prefs?.key || "#" + f.id, f.prefs!.def!]));
    try { Object.assign(o, JSON.parse(localStorage.getItem("sv:" + token.slice(0, 16)) || "{}")); } catch { /* private window: start fresh */ }
    return o;
  }), [pw, setPw] = useState(""), [code, setCode] = useState(""), [sent, setSent] = useState(false);
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

  const slot = (f: F) => f.prefs?.key || "#" + f.id;
  const kv = Object.fromEntries(fields.filter((f) => f.prefs?.key).map((f) => [f.prefs!.key!, vals[slot(f)] ?? ""]));
  const shown = (f: F) => { const c = f.prefs?.cond; if (!c) return true; const v = kv[c.key] ?? ""; return c.op === "filled" ? !!v && v !== "false" : c.op === "eq" ? v === (c.val ?? "") : v !== (c.val ?? ""); }; // same rule the server applies
  const set = (f: F, v: string) => setVals((o) => ({ ...o, [slot(f)]: v }));
  const box = (f: F) => ({ position: "absolute" as const, left: f.x + "%", top: f.y + "%", width: f.w + "%", height: f.h + "%", boxSizing: "border-box" as const, lineHeight: "normal", fontSize: f.prefs?.size ?? 13 });
  const inputStyle = (f: F) => ({ ...box(f), border: "1.5px solid #2563eb", background: f.prefs?.ro ? "#e5e7ebcc" : "#dbeafe99", padding: "0 3px", textAlign: ({ c: "center", r: "right" } as const)[f.prefs?.align as "c"] });
  const pick = (f: F, file?: File) => { // shrink the picture in the browser: the server only accepts a small PNG/JPEG
    if (!file) return;
    const im = new Image(); im.onload = () => { const k = Math.min(1, 700 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = im.width * k; c.height = im.height * k; const x = c.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); set(f, c.toDataURL("image/jpeg", 0.8)); URL.revokeObjectURL(im.src); };
    im.src = URL.createObjectURL(file);
  };
  const overlay = (page: number) => fields.filter((f) => f.page === page && shown(f)).map((f) => {
    const t = f.type, hint = f.label || t, id = "f" + f.id, v = vals[slot(f)] ?? "";
    if (t === "text" || t === "number") return <input key={f.id} id={id} value={v} onChange={(e) => set(f, e.target.value)} placeholder={hint} aria-label={hint} maxLength={500} readOnly={!!f.prefs?.ro} inputMode={t === "number" ? "decimal" : undefined} style={inputStyle(f)} />;
    if (t === "cells") return <input key={f.id} id={id} value={v} onChange={(e) => set(f, e.target.value.slice(0, f.prefs?.cells ?? 10))} placeholder={hint} aria-label={hint} maxLength={f.prefs?.cells ?? 10} readOnly={!!f.prefs?.ro} style={{ ...inputStyle(f), letterSpacing: "0.35em", fontFamily: "monospace" }} />;
    if (t === "image") return <label key={f.id} style={{ ...box(f), border: "1.5px solid #2563eb", background: v ? `#fff url(${v}) center/contain no-repeat` : "#dbeafe99", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", color: "#1e3a8a" }}>{!v && `📷 ${hint}`}<input id={id} type="file" accept="image/png,image/jpeg" onChange={(e) => pick(f, e.target.files?.[0])} style={{ position: "absolute", opacity: 0, inset: 0, width: "100%", height: "100%", cursor: "pointer" }} aria-label={hint} /></label>;
    if (t === "dropdown") return <select key={f.id} id={id} value={v} onChange={(e) => set(f, e.target.value)} aria-label={hint} style={{ ...box(f), border: "1.5px solid #2563eb", background: "#dbeafe" }}><option value="">{hint}</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>;
    if (t === "checkbox") return <input key={f.id} id={id} type="checkbox" checked={v === "true"} onChange={(e) => set(f, e.target.checked ? "true" : "")} aria-label={hint} style={{ ...box(f), margin: 0, accentColor: "#2563eb" }} />;
    const auto = t === "date" ? new Date().toLocaleDateString() : t === "name" ? name : t === "email" ? "(your email)" : t === "signature" ? "✍ Sign below" : "Initials";
    return <div key={f.id} style={{ ...box(f), border: "1.5px dashed #2563eb", background: "#dbeafe66", color: "#1e3a8a", display: "flex", alignItems: "center", padding: "0 3px", overflow: "hidden", whiteSpace: "nowrap" }}>{auto}</div>;
  });
  // "Next field" walks the signer through what's still empty, top to bottom; when nothing is left it points at the signing box.
  const todo = fields.filter((f) => shown(f) && f.required && !f.prefs?.ro && ["text", "number", "cells", "image", "checkbox", "dropdown"].includes(f.type) && !(vals[slot(f)] ?? "")).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const next = () => { const el = todo.length ? document.getElementById("f" + todo[0].id) : document.getElementById("sign-box"); el?.scrollIntoView({ behavior: "smooth", block: "center" }); (el as HTMLElement | null)?.focus?.({ preventScroll: true }); };
  useEffect(() => { try { localStorage.setItem("sv:" + token.slice(0, 16), JSON.stringify(Object.fromEntries(Object.entries(vals).filter(([k]) => !fields.some((f) => f.type === "image" && (f.prefs?.key || "#" + f.id) === k))))); } catch { /* storage blocked: no autosave */ } }, [vals]); // pictures are too big to keep
  const submit = (signature: string, drawn: string, initials: string) => call({ action: "sign", signature, drawn, initials, values: Object.fromEntries(fields.map((f) => [f.id, shown(f) ? vals[slot(f)] ?? "" : ""])) }, () => { try { localStorage.removeItem("sv:" + token.slice(0, 16)); } catch { /* ignore */ } setS("signed"); });
  return (
    <>
      {pdf && <><p className="sub" style={{ margin: 0 }}>{fields.some((f) => !["signature", "initials", "date", "name", "email"].includes(f.type)) ? "Fill in the highlighted boxes on the document, then " : ""}{role === "viewer" ? "confirm below that you've read it." : "sign below."}</p>{role !== "viewer" && <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--bg, #fff)", padding: "6px 0" }}><button type="button" className="pri" onClick={next}>{todo.length ? `Next field (${todo.length} left)` : "All filled in: go to signing"}</button></div>}<PdfPages src={`/api/sign/pdf?token=${token}`} overlay={overlay} /></>}
      {role === "viewer"
        ? <p><button className="pri" disabled={busy} onClick={() => call({ action: "sign" }, () => setS("signed"))}>I've read this document</button></p>
        : <div id="sign-box" tabIndex={-1}><SignPad name={name} busy={busy} label={role === "approver" ? "Approve" : "Sign"} initials={fields.some((f) => f.type === "initials")} onSign={submit} /></div>}
      {err && <p role="alert" style={{ color: "#b00020" }}>{err}</p>}
      {role !== "viewer" && (no ? <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await confirmDialog("Decline to sign this document? This can't be undone.", { ok: "Yes, decline", danger: true })) call({ action: "decline", reason }, () => setS("declined")); }}><label>Reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required style={{ width: "100%" }} /></label><button disabled={busy}>Decline</button></form>
        : <p><button type="button" onClick={() => setNo(true)}>I can't {role === "approver" ? "approve" : "sign"} this</button></p>)}
    </>
  );
}
