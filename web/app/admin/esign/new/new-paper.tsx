"use client";
import Notice from "@/components/notice";
import { useDirtyGuard } from "@/components/dirty-guard";
import { useEffect, useRef, useState } from "react";
import PdfPages, { readPages } from "@/components/pdf-pages";
import { detect } from "@/lib/pdf-detect";
import { board } from "../rpc";

type P = { name: string; email: string; role: string; ord: number; password: string; verify: boolean };
type F = { r: number; type: string; page: number; x: number; y: number; w: number; h: number; label: string; options: string[]; required: boolean; conf?: number; prefs?: Prefs };
type Prefs = { def?: string; ro?: boolean; align?: "l" | "c" | "r"; size?: number; key?: string; cells?: number; stamp?: boolean; cond?: { key: string; op: "eq" | "neq" | "filled"; val?: string } };
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const SIZE: Record<string, [number, number]> = { signature: [22, 5], initials: [9, 4], date: [14, 3], name: [20, 3], email: [22, 3], text: [25, 3], number: [14, 3], cells: [26, 3], image: [18, 8], checkbox: [3, 2.4], dropdown: [22, 3] };
const COLORS = ["#2563eb", "#c026d3", "#16a34a", "#ea580c", "#0891b2", "#9333ea", "#be123c", "#4d7c0f"];
const ROLE_HELP: Record<string, string> = { signer: "signs", approver: "approves", viewer: "just reads it", cc: "gets the finished copy" };
const b64 = (buf: ArrayBuffer) => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

export default function NewPaper({ buckets, templates }: { buckets: { id: number; name: string }[]; templates: { id: number; title: string }[] }) {
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [pdf, setPdf] = useState<ArrayBuffer | null>(null), [bucket, setBucket] = useState(""), [tags, setTags] = useState(""), [present, setPresent] = useState(""), [due, setDue] = useState("");
  const [message, setMessage] = useState(""), [redirect, setRedirect] = useState(""), [hideAudit, setHideAudit] = useState(false), [seq, setSeq] = useState(false), [hold, setHold] = useState(false);
  const [all, setAll] = useState(true), [needed, setNeeded] = useState(1), [signers, setSigners] = useState<P[]>([]), [q, setQ] = useState(""), [found, setFound] = useState<{ name: string; email: string }[]>([]), [manual, setManual] = useState({ name: "", email: "" });
  const [fields, setFields] = useState<F[]>([]), [note, setNote] = useState(""), [tool, setTool] = useState(""), [cur, setCur] = useState(0), [sel, setSel] = useState(-1);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [done, setDone] = useState(""), pdfKey = useRef(0);
  useDirtyGuard(done ? 0 : [title, body, !!pdf, signers, fields, message, tags]);
  const actors = signers.map((s, i) => [s, i] as const).filter(([s]) => s.role === "signer" || s.role === "approver");
  const add = (p: { name: string; email: string }, role = "signer") => { if (p.name && (p.email || role === "slot") && !signers.some((s) => p.email && s.email.toLowerCase() === p.email.toLowerCase())) setSigners([...signers, { ...p, role: role === "slot" ? "signer" : role, ord: 1, password: "", verify: false }]); };
  const setP = (i: number, v: Partial<P>) => setSigners(signers.map((s, j) => (j === i ? { ...s, ...v } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= signers.length) return;
    const n = [...signers];
    n[i] = { ...signers[j], ord: signers[i].ord }; n[j] = { ...signers[i], ord: signers[j].ord }; // the people trade places, the order slots stay
    setSigners(n); setFields(fields.map((f) => ({ ...f, r: f.r === i ? j : f.r === j ? i : f.r }))); setCur(cur === i ? j : cur === j ? i : cur);
  };
  const drop = (i: number) => { setSigners(signers.filter((_, j) => j !== i)); setFields(fields.filter((f) => f.r !== i).map((f) => ({ ...f, r: f.r > i ? f.r - 1 : f.r }))); setCur(0); setSel(-1); };
  const search = async (v: string) => { setQ(v); setFound(await board("people", { q: v }).catch(() => [])); }; // empty box = your recent contacts
  const upload = async (file?: File) => { if (!file) return; if (file.size > 8_000_000) return setErr("PDFs can be up to 8 MB."); setErr(""); pdfKey.current++; setFields([]); setPdf(await file.arrayBuffer()); if (!title) setTitle(file.name.replace(/\.pdf$/i, "")); };
  const doc = () => ({ title, body: pdf ? "" : body, pdf: pdf ? b64(pdf) : undefined, bucket_id: bucket ? Number(bucket) : null, tags: csv(tags), present: csv(present), needed: all ? 0 : needed, due_at: due || null, message, redirect_url: redirect, hide_audit: hideAudit, sequential: seq, hold, signers, fields });
  const useTemplate = async (id: string) => {
    if (!id) return;
    try {
      const t = await board("template", { id: Number(id) });
      setTitle(t.title); setBody(t.body); pdfKey.current++; setPdf(t.pdf ? unb64(t.pdf) : null); setMessage(t.message ?? ""); setRedirect(t.redirect_url ?? ""); setHideAudit(!!t.hide_audit); setSeq(!!t.sequential); setTags((t.tags ?? []).join(", ")); setPresent((t.present ?? []).join(", "));
      setAll(!t.needed); setNeeded(t.needed || 1); setSigners((t.signers ?? []).map((s: any) => ({ name: s.name, email: s.email, role: s.role ?? "signer", ord: s.ord ?? 1, password: "", verify: !!s.verify }))); setFields((t.fields ?? []).map((f: any) => ({ ...f, label: f.label ?? "", options: f.options ?? [] }))); setErr("");
    } catch (x: any) { setErr(x.message); }
  };
  const run = async (op: "create" | "saveTemplate") => {
    setBusy(true); setErr("");
    try {
      const r = await board(op, { doc: doc() });
      setDone(op === "saveTemplate" ? "Template saved. Start a document from it any time, or turn on its public link under Templates." : r.failed.length ? `Created, but the email to ${r.failed.join(", ")} failed. Use "Send reminder" on the document to retry.` : "Created. The people who are up first have been emailed a link.")
      if (op === "create" && hold) setDone("Created. Nobody has been emailed yet: open the document and use \"Email link\" next to each person.");
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };
  // Placing, moving and resizing fields on the PDF (positions are percentages of the page, so they survive any screen size).
  const place = (page: number, e: { clientX: number; clientY: number; currentTarget: HTMLElement }, type = tool) => {
    if (!type || !SIZE[type] || !actors.length) return;
    if (!actors.some(([, i]) => i === cur)) setCur(actors[0][1]);
    const r = e.currentTarget.getBoundingClientRect(), [w, h] = SIZE[type];
    const f: F = { r: actors.some(([, i]) => i === cur) ? cur : actors[0][1], type, page, x: Math.max(0, Math.min(100 - w, (e.clientX - r.left) / r.width * 100 - w / 2)), y: Math.max(0, Math.min(100 - h, (e.clientY - r.top) / r.height * 100 - h / 2)), w, h, label: "", options: type === "dropdown" ? ["Option 1", "Option 2"] : [], required: true };
    setFields([...fields, f]); setSel(fields.length); setTool("");
  };
  const drag = (i: number, mode: "move" | "size") => (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation(); e.preventDefault(); setSel(i);
    const pg = (e.currentTarget as HTMLElement).closest("[data-page]")!.getBoundingClientRect(), f0 = fields[i], sx = e.clientX, sy = e.clientY;
    const mv = (m: PointerEvent) => { const dx = (m.clientX - sx) / pg.width * 100, dy = (m.clientY - sy) / pg.height * 100;
      setFields((all) => all.map((f, j) => j !== i ? f : mode === "move" ? { ...f, x: Math.max(0, Math.min(100 - f.w, f0.x + dx)), y: Math.max(0, Math.min(100 - f.h, f0.y + dy)) } : { ...f, w: Math.max(2, Math.min(100 - f.x, f0.w + dx)), h: Math.max(1.5, Math.min(100 - f.y, f0.h + dy)) })); };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const overlay = (page: number) => fields.map((f, i) => f.page !== page ? null : (
    <div key={i} onPointerDown={drag(i, "move")} onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: f.x + "%", top: f.y + "%", width: f.w + "%", height: f.h + "%", border: `2px ${sel === i ? "solid" : "dashed"} ${COLORS[f.r % 8]}`, background: COLORS[f.r % 8] + "33", boxSizing: "border-box", cursor: "move", fontSize: 11, lineHeight: "normal", overflow: "hidden", color: "#111", touchAction: "none" }}>
      {f.conf != null && f.conf < 0.7 && <span title="Auto-detect wasn't sure about this one: check its spot">⚠ </span>}{f.type}{f.label ? `: ${f.label}` : ""} · {signers[f.r]?.name.split(" ")[0]}
      <span onPointerDown={drag(i, "size")} aria-label="Resize" style={{ position: "absolute", right: 0, bottom: 0, width: 10, height: 10, background: COLORS[f.r % 8], cursor: "nwse-resize" }} />
    </div>));
  const auto = async () => {
    if (!pdf) return;
    setNote("Looking for signature lines, dates, initials and form fields…");
    try {
      const found = detect(await readPages(pdf), cur, signers.length - 1).filter((n) => actors.some(([, i]) => i === n.r));
      // skip anything that lands on a field already placed
      const fresh = found.filter((n) => !fields.some((o) => o.page === n.page && Math.min(o.x + o.w, n.x + n.w) - Math.max(o.x, n.x) > 0.3 * Math.min(o.w, n.w) && Math.min(o.y + o.h, n.y + n.h) - Math.max(o.y, n.y) > 0.3 * Math.min(o.h, n.h)));
      setFields([...fields, ...fresh]);
      setNote(fresh.length ? `Added ${fresh.length} field${fresh.length === 1 ? "" : "s"} for ${signers[cur]?.name}. Check them over, drag to adjust, and change a field's person if it belongs to someone else. Run it again after picking another person to catch fields for them.` : "Nothing new found. Place fields by hand below.");
    } catch (x: any) { setNote("Couldn't read this PDF for fields: " + x.message); }
  };
  const f = fields[sel];
  // Every page gets the same box. Signatures and initials stamp the signer's one mark everywhere, so no extra work at signing time.
  const repeat = async (f: F) => {
    if (!pdf) return;
    const shares = !["signature", "initials"].includes(f.type), key = shares ? f.prefs?.key || "box" + Date.now().toString(36) : f.prefs?.key; // one answer, stamped on every page
    const n = (await readPages(pdf)).length, mine = { ...f, prefs: key ? { ...f.prefs, key } : f.prefs };
    const add = Array.from({ length: n }, (_, k) => k + 1).filter((p) => !fields.some((o) => o.r === f.r && o.type === f.type && o.page === p)).map((p) => ({ ...mine, page: p }));
    setFields([...fields.map((x) => (x === f ? mine : x)), ...add]);
  };
  // Keyboard on the page: arrows nudge (shift = bigger), Delete removes, Ctrl/Cmd C / V copy and paste, Ctrl/Cmd Z undo.
  const past = useRef<F[][]>([]), last = useRef<F[]>(fields), clip = useRef<F | null>(null), undoing = useRef(false);
  useEffect(() => {
    if (undoing.current) { undoing.current = false; last.current = fields; return; }
    const t = setTimeout(() => { if (last.current !== fields) { past.current.push(last.current); if (past.current.length > 50) past.current.shift(); last.current = fields; } }, 500);
    return () => clearTimeout(t);
  }, [fields]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement; if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { const p = past.current.pop(); if (p) { e.preventDefault(); undoing.current = true; setFields(p); setSel(-1); } return; }
      if (sel < 0 || !fields[sel]) return;
      const f = fields[sel], step = e.shiftKey ? 1 : 0.2;
      if (mod && e.key.toLowerCase() === "c") clip.current = f;
      else if (mod && e.key.toLowerCase() === "v" && clip.current) { e.preventDefault(); const c = clip.current; setFields([...fields, { ...c, x: Math.min(100 - c.w, c.x + 2), y: Math.min(100 - c.h, c.y + 2) }]); setSel(fields.length); clip.current = { ...c, x: c.x + 2, y: c.y + 2 }; }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setFields(fields.filter((_, j) => j !== sel)); setSel(-1); }
      else if (e.key.startsWith("Arrow")) { e.preventDefault(); const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0; setFields(fields.map((x, j) => j !== sel ? x : { ...x, x: Math.max(0, Math.min(100 - x.w, x.x + dx)), y: Math.max(0, Math.min(100 - x.h, x.y + dy)) })); }
    };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, [fields, sel]);
  const setF = (v: Partial<F>) => setFields(fields.map((x, j) => (j === sel ? { ...x, ...v } : x)));

  if (done) return <><h1>New document</h1><p role="status">{done}</p><p><a href="/admin/esign">Back to documents</a> · <a href="/admin/esign/new" onClick={() => location.assign("/admin/esign/new")}>Start another</a></p></>;
  const who = (i: number) => signers[i]?.name.split(" ")[0] ?? "";
  const fieldSettings = f && (
    <div className="bar card" style={{ margin: 0 }}>
      <strong>{f.type}</strong>
      <label>for <select value={f.r} onChange={(e) => setF({ r: Number(e.target.value) })}>{actors.map(([s, i]) => <option key={i} value={i}>{s.name}</option>)}</select></label>
      {["text", "number", "cells", "image", "dropdown", "checkbox"].includes(f.type) && <input placeholder="Label / hint" value={f.label} onChange={(e) => setF({ label: e.target.value })} maxLength={100} />}
      {f.type === "dropdown" && <input placeholder="Choices, comma separated" value={f.options.join(", ")} onChange={(e) => setF({ options: csv(e.target.value) })} />}
      {["text", "number"].includes(f.type) && <>
        <input placeholder="Pre-filled value" value={f.prefs?.def ?? ""} onChange={(e) => setF({ prefs: { ...f.prefs, def: e.target.value } })} maxLength={500} />
        <label><input type="checkbox" checked={!!f.prefs?.ro} disabled={!f.prefs?.def} onChange={(e) => setF({ prefs: { ...f.prefs, ro: e.target.checked } })} /> read-only</label>
        <select value={f.prefs?.align ?? "l"} onChange={(e) => setF({ prefs: { ...f.prefs, align: e.target.value as "l" } })} aria-label="Alignment"><option value="l">left</option><option value="c">center</option><option value="r">right</option></select>
        <input type="number" min={6} max={24} placeholder="Font pt" value={f.prefs?.size ?? ""} onChange={(e) => setF({ prefs: { ...f.prefs, size: Number(e.target.value) || undefined } })} style={{ width: 80 }} /></>}
      {f.type === "cells" && <input type="number" min={2} max={40} placeholder="Boxes" value={f.prefs?.cells ?? ""} onChange={(e) => setF({ prefs: { ...f.prefs, cells: Number(e.target.value) || undefined } })} style={{ width: 80 }} title="How many one-letter boxes" />}
      {f.type === "signature" && <label><input type="checkbox" checked={!!f.prefs?.stamp} onChange={(e) => setF({ prefs: { ...f.prefs, stamp: e.target.checked } })} /> print name, date and IP under it</label>}
      {["text", "number", "cells", "checkbox", "dropdown"].includes(f.type) && <input placeholder="Name (boxes with the same name share one answer)" value={f.prefs?.key ?? ""} onChange={(e) => setF({ prefs: { ...f.prefs, key: e.target.value.trim() || undefined } })} maxLength={40} style={{ width: "100%", boxSizing: "border-box" }} />}
      <span className="sub">Show only if</span>
      <input placeholder="named box…" value={f.prefs?.cond?.key ?? ""} onChange={(e) => setF({ prefs: { ...f.prefs, cond: e.target.value.trim() ? { op: "filled", ...f.prefs?.cond, key: e.target.value.trim() } : undefined } })} style={{ width: 120 }} />
      {f.prefs?.cond && <><select value={f.prefs.cond.op} onChange={(e) => setF({ prefs: { ...f.prefs, cond: { ...f.prefs!.cond!, op: e.target.value as "eq" } } })}><option value="filled">is filled / ticked</option><option value="eq">equals</option><option value="neq">doesn't equal</option></select>
        {f.prefs.cond.op !== "filled" && <input placeholder="value" value={f.prefs.cond.val ?? ""} onChange={(e) => setF({ prefs: { ...f.prefs, cond: { ...f.prefs!.cond!, val: e.target.value } } })} style={{ width: 110 }} />}</>}
      {["signature", "initials"].includes(f.type) && <button type="button" onClick={() => repeat(f)}>Repeat on every page</button>}
      {["text", "number", "cells", "checkbox", "dropdown"].includes(f.type) && <button type="button" onClick={() => repeat(f)}>Repeat on every page (same answer)</button>}
      {["text", "number", "cells", "image", "dropdown", "checkbox", "initials"].includes(f.type) && <label><input type="checkbox" checked={f.required} onChange={(e) => setF({ required: e.target.checked })} /> required</label>}
      <button type="button" onClick={() => { setFields(fields.filter((_, j) => j !== sel)); setSel(-1); }}>Delete field</button>
    </div>);
  return (
    <>
      <style>{`.np{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}.np-side{position:sticky;top:8px;max-height:calc(100vh - 16px);overflow:auto;display:grid;gap:10px;align-content:start}.np-side details.card{padding:6px 12px}.np-side summary{cursor:pointer;font-weight:600;padding:4px 0}.np-tile{cursor:grab;border:1px solid var(--line);border-radius:8px;padding:8px 6px;text-align:center;background:var(--card);font-size:13px;user-select:none}.np-tile.on{outline:2px solid var(--accent,#2563eb)}.np-foot{position:sticky;bottom:0;background:var(--bg,#fff);padding:8px 0;display:grid;gap:8px}@media(max-width:1000px){.np{grid-template-columns:1fr}.np-side{position:static;max-height:none}.np-foot{position:static}}`}</style>
      <h1>New document</h1>
      <p className="sub">Upload a PDF (or write the text), add the people, drag signature and other fields onto the pages, and each person gets an emailed link. When it's complete everyone gets the signed PDF.</p>
      <form onSubmit={(e) => { e.preventDefault(); run("create"); }} style={{ display: "grid", gap: 12 }}>
        {templates.length > 0 && <label>Start from a template <select defaultValue="" onChange={(e) => useTemplate(e.target.value)}><option value="">(blank)</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>}
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} style={{ width: "100%", boxSizing: "border-box" }} /></label>
        <div className="np">
          <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
            <fieldset className="card"><legend>Document</legend>
              <label>Upload a PDF <input type="file" accept="application/pdf" onChange={(e) => upload(e.target.files?.[0])} /></label>
              {pdf ? <p className="sub">PDF loaded. <button type="button" onClick={() => { setPdf(null); setFields([]); }}>Remove it and type text instead</button></p>
                : <label>…or write the document text<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} maxLength={60000} style={{ width: "100%", boxSizing: "border-box" }} /></label>}
            </fieldset>
            {pdf && <PdfPages key={pdfKey.current} src={pdf} overlay={overlay} onPage={place} onDropPage={(n, e) => place(n, e, e.dataTransfer.getData("text/plain"))} />}
          </div>
          <aside className="np-side" aria-label="Recipients, fields and options">
            <details className="card" open><summary>Recipients ({signers.length})</summary>
              <label>Find a member <input value={q} onChange={(e) => search(e.target.value)} onFocus={() => !q && search("")} placeholder="name or email (people you used in the last 6 months show first)" style={{ width: "100%", boxSizing: "border-box" }} /></label>
              {found.map((p) => <button type="button" key={p.email} onClick={() => { add(p); setQ(""); setFound([]); }}>+ {p.name} ({p.email})</button>)}
              <div className="bar"><input placeholder="Or a name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} style={{ width: 120 }} /><input type="email" placeholder="email (blank = template slot)" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} style={{ width: 150 }} /><button type="button" onClick={() => { add(manual, manual.email ? "signer" : "slot"); setManual({ name: "", email: "" }); }}>Add</button></div>
              {signers.map((s, i) => (
                <div key={i} className="bar" style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginBottom: 6, borderLeft: `4px solid ${COLORS[i % 8]}`, paddingLeft: 8, background: cur === i && actors.some(([, k]) => k === i) ? COLORS[i % 8] + "14" : undefined }}>
                  <span style={{ flexBasis: "100%", cursor: "pointer" }} onClick={() => actors.some(([, k]) => k === i) && setCur(i)} title="Click to place new fields for this person"><strong style={{ color: COLORS[i % 8] }}>{seq ? `${s.ord}. ` : ""}{s.name}</strong> <span className="sub">{s.email || "(slot a public-link visitor fills)"}</span></span>
                  <select value={s.role} onChange={(e) => { setP(i, { role: e.target.value }); if (e.target.value === "viewer" || e.target.value === "cc") setFields(fields.filter((x) => x.r !== i)); }} aria-label="Role">{Object.entries(ROLE_HELP).map(([k, v]) => <option key={k} value={k}>{k} ({v})</option>)}</select>
                  <button type="button" onClick={() => move(i, -1)} disabled={!i} aria-label="Move up">↑</button><button type="button" onClick={() => move(i, 1)} disabled={i === signers.length - 1} aria-label="Move down">↓</button>
                  {seq && <label>Order <input type="number" min={1} max={50} value={s.ord} onChange={(e) => setP(i, { ord: Number(e.target.value) || 1 })} style={{ width: 56 }} /></label>}
                  {s.role !== "cc" && <><input type="text" autoComplete="off" placeholder="Password (optional)" value={s.password} onChange={(e) => setP(i, { password: e.target.value })} style={{ width: 150 }} /><label><input type="checkbox" checked={s.verify} onChange={(e) => setP(i, { verify: e.target.checked })} /> email code</label></>}
                  <button type="button" onClick={() => drop(i)}>Remove</button>
                </div>))}
              <p className="sub" style={{ margin: "6px 0" }}>A password is given to the person by you, outside the email. "Email code" sends a 6-digit code to their address when they open the link.</p>
              <label style={{ display: "block" }}><input type="checkbox" checked={seq} onChange={(e) => setSeq(e.target.checked)} /> Sign in order: people with a higher order number only get their link after everyone below them has finished (same number = at the same time)</label>
              <label style={{ display: "block" }}><input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> Don't email anyone yet: I'll send each person's link myself from the document</label>
              <label style={{ display: "block" }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every signer and approver must sign</label>
              {!all && <label>It is complete after <input type="number" min={1} max={Math.max(1, actors.length)} value={needed} onChange={(e) => setNeeded(Number(e.target.value))} style={{ width: 70 }} /> signature{needed === 1 ? "" : "s"} (a quorum)</label>}
            </details>
            <details className="card" open><summary>Fields{fields.length ? ` (${fields.length})` : ""}</summary>
              {!pdf ? <p className="sub">Upload a PDF to place signature fields and use ✨ Auto-detect.</p>
                : !actors.length ? <><p className="sub">Add a signer or approver first, then place their fields.</p><button type="button" className="pri" disabled>✨ Auto-detect fields</button></> : <>
                <div className="bar">
                  <button type="button" className="pri" onClick={auto}>✨ Auto-detect fields</button>
                  {fields.length > 0 && <button type="button" onClick={() => { setFields([]); setSel(-1); setNote(""); }}>Clear all fields</button>}
                </div>
                <label>For <select value={actors.some(([, i]) => i === cur) ? cur : actors[0][1]} onChange={(e) => setCur(Number(e.target.value))}>{actors.map(([s, i]) => <option key={i} value={i}>{s.name}</option>)}</select></label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, margin: "8px 0" }}>
                  {Object.keys(SIZE).map((t) => <div key={t} role="button" tabIndex={0} draggable className={"np-tile" + (tool === t ? " on" : "")} onDragStart={(e) => { e.dataTransfer.setData("text/plain", t); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => setTool(tool === t ? "" : t)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setTool(tool === t ? "" : t))} style={{ borderTop: `3px solid ${COLORS[(actors.some(([, i]) => i === cur) ? cur : actors[0][1]) % 8]}` }}>{t}</div>)}
                </div>
                {note && <p role="status" className="sub" style={{ margin: 0 }}>{note}</p>}
                <p className="sub" style={{ margin: 0 }}>{tool ? `Click the page where the ${tool} field goes.` : "Drag a field type onto the page, or pick one and click the page. Drag a placed field to move it, drag its corner to resize."}</p>
              </>}
              {fieldSettings}
              {fields.length > 0 && <div style={{ marginTop: 8 }}>
                {Array.from(new Set(fields.map((x) => x.page))).sort((a, b) => a - b).map((pg) => <div key={pg}><div className="sub" style={{ margin: "6px 0 2px" }}>Page {pg}</div>
                  {fields.map((x, i) => x.page !== pg ? null : <div key={i} onClick={() => setSel(i)} style={{ cursor: "pointer", padding: "3px 6px", borderLeft: `4px solid ${COLORS[x.r % 8]}`, background: sel === i ? COLORS[x.r % 8] + "22" : undefined, fontSize: 13 }}>{x.conf != null && x.conf < 0.7 ? "⚠ " : ""}{x.type}{x.label ? `: ${x.label}` : ""} · {who(x.r)}</div>)}</div>)}
              </div>}
            </details>
            <details className="card" open><summary>Details and options</summary>
              <div className="bar">
                <label>Folder <select value={bucket} onChange={(e) => setBucket(e.target.value)}><option value="">(none)</option>{buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                <label>Tags <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="finance, 2026" /></label>
                <label>Due <input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
              </div>
              <label>People present (comma separated, for the record)<input value={present} onChange={(e) => setPresent(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} /></label>
              <label>Message added to the signing email and shown above the document<textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} style={{ width: "100%", boxSizing: "border-box" }} /></label>
              <label>After signing, send them to (optional web address)<input type="url" value={redirect} onChange={(e) => setRedirect(e.target.value)} placeholder="https://" style={{ width: "100%", boxSizing: "border-box" }} /></label>
              <label><input type="checkbox" checked={hideAudit} onChange={(e) => setHideAudit(e.target.checked)} /> Leave the signing-certificate page off the finished PDF</label>
            </details>
            <div className="np-foot">
              {err && <Notice kind="error">{err}</Notice>}
              <div className="bar" style={{ margin: 0 }}>
                <button className="pri" disabled={busy || !signers.length}>{busy ? "Working…" : "Create and email signers"}</button>
                <button type="button" disabled={busy || !signers.length} onClick={() => run("saveTemplate")}>Save as template instead</button>
              </div>
            </div>
          </aside>
        </div>
      </form>
    </>
  );
}
