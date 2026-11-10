import { createHash, randomBytes, randomInt } from "crypto";
import { PDFDocument } from "pdf-lib";
import { checkPw, hashPw } from "./sign-access";
export { cookieOf, unlockCookie, unlocked } from "./sign-access";
import { conn } from "./db";
import { logAudit } from "./store";
import { getMailCfg, mailReady, sendQueued as send } from "./mail";
import { open, seal, sha256 } from "./vault";
import { buildAgreementPdf, buildFieldPdf, buildPdf } from "./sign-pdf";
import { sealPdf } from "./pdf-seal";
import { fullText, type Version } from "./waiver-diff";

// E-signature engine (the Documenso-style part): a document, signers who each get an emailed one-time link, a signed PDF with a signing certificate, kept encrypted.
// Used for board papers (kind 'board') and member waivers (kind 'waiver', signed in-session, no link).
// Roles: signer and approver must act (and need a signature field on a PDF); viewer just confirms they've read it; cc only gets the finished copy.
export const ROLES = ["signer", "approver", "viewer", "cc"] as const;
export const FIELD_TYPES = ["signature", "initials", "date", "name", "email", "text", "checkbox", "dropdown"] as const;
export type Role = (typeof ROLES)[number];
export type Signer = { id: number; name: string; email: string; role: Role; ord: number; has_pw: boolean; verify_email: boolean; sent_at: string | null; viewed_at: string | null; signed_at: string | null; declined_at: string | null; decline_reason: string };
export type Doc = { id: number; kind: string; title: string; body: string; has_pdf: boolean; message: string; redirect_url: string; hide_audit: boolean; sequential: boolean; bucket_id: number | null; bucket: string | null; tags: string[]; present: string[]; needed: number; status: string; due_at: string | null; created_by: string; created_at: string; completed_at: string | null; signers: Signer[] };
export type Recipient = { name: string; email: string; role?: Role; ord?: number; password?: string; verify?: boolean };
export type FieldIn = { r: number; type: string; page: number; x: number; y: number; w: number; h: number; label?: string; options?: string[]; required?: boolean };
/** Everything about a paper except its title and PDF; this is also what a template stores (minus passwords). */
export type Setup = { message?: string; redirect_url?: string; hide_audit?: boolean; sequential?: boolean; needed?: number; tags?: string[]; present?: string[]; signers: Recipient[]; fields?: FieldIn[] };
export type NewDoc = Setup & { hold?: boolean; title: string; body?: string; pdf?: string | Buffer; bucket_id?: number | null; due_at?: string | null };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const esc = (s: string) => s.replace(/[<>&"]/g, "");
const hashTok = (t: string) => createHash("sha256").update(t).digest("hex");
const num = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? [...new Set(v.map((x) => clip(x, len)).filter(Boolean))].slice(0, n) : []);

// ---- buckets and listing
export const listBuckets = async () => (await (await conn()).query("SELECT b.id, b.name, (SELECT count(*)::int FROM sign_docs d WHERE d.bucket_id = b.id) AS n FROM sign_buckets b ORDER BY lower(b.name)")).rows as { id: number; name: string; n: number }[];
export async function addBucket(name: string) {
  const n = clip(name, 80);
  if (!n) throw new Error("Give the bucket a name.");
  await (await conn()).query("INSERT INTO sign_buckets (name) VALUES ($1) ON CONFLICT DO NOTHING", [n]);
}
export async function deleteBucket(id: number) { await (await conn()).query("DELETE FROM sign_buckets WHERE id = $1", [id]); } // its papers become unbucketed

const DOC_SQL = `SELECT d.id, d.kind, d.title, d.body, d.source IS NOT NULL AS has_pdf, d.message, d.redirect_url, d.hide_audit, d.sequential, d.bucket_id, b.name AS bucket, d.tags, d.present, d.needed, d.status, d.due_at, d.created_by, d.created_at, d.completed_at,
  COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'email', s.email, 'role', s.role, 'ord', s.ord, 'has_pw', s.pw_hash <> '', 'verify_email', s.verify_email, 'sent_at', s.sent_at, 'viewed_at', s.viewed_at, 'signed_at', s.signed_at, 'declined_at', s.declined_at, 'decline_reason', s.decline_reason) ORDER BY s.id) FROM sign_signers s WHERE s.doc_id = d.id), '[]') AS signers
  FROM sign_docs d LEFT JOIN sign_buckets b ON b.id = d.bucket_id`;

export async function listDocs(f: { bucket?: number; tag?: string; status?: string; q?: string } = {}): Promise<Doc[]> {
  const c = await conn();
  await c.query("UPDATE sign_docs SET status = 'expired' WHERE status = 'open' AND due_at < now()");
  const like = "%" + clip(f.q, 100).replace(/[\\%_]/g, "\\$&") + "%";
  return (await c.query(`${DOC_SQL} WHERE d.kind = 'board' AND ($1::int IS NULL OR d.bucket_id = $1) AND ($2::text = '' OR $2 = ANY(d.tags)) AND ($3::text = '' OR d.status = $3) AND d.title ILIKE $4 ORDER BY d.id DESC LIMIT 200`,
    [f.bucket || null, clip(f.tag, 50), clip(f.status, 20), like])).rows;
}
export const getDoc = async (id: number): Promise<Doc | null> => (await (await conn()).query(`${DOC_SQL} WHERE d.id = $1`, [id])).rows[0] ?? null;
export const listTags = async () => (await (await conn()).query("SELECT DISTINCT unnest(tags) AS t FROM sign_docs WHERE kind = 'board' ORDER BY 1")).rows.map((r) => r.t as string);

// ---- access (password / emailed code) and the unlock cookie
export async function sendCode(token: string) {
  const f = await byToken(token);
  if (!f || !f.signer.verify_email || f.doc.status !== "open") throw new Error("This signing link can't be used.");
  const c = await conn(), code = String(randomInt(100000, 1000000));
  if (!(await c.query("UPDATE sign_signers SET code_hash = $2, code_exp = now() + interval '10 minutes' WHERE id = $1 AND (code_exp IS NULL OR code_exp < now() + interval '9 minutes')", [f.signer.id, hashTok(code + ":" + f.signer.id)])).rowCount) throw new Error("A code was just sent. Please wait a minute before asking for another.");
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email isn't set up, so a code can't be sent.");
  await send({ to: f.signer.email, subject: `Your signing code: ${code}`, text: `Your code to open "${f.doc.title}" is ${code}. It works for 10 minutes. If you didn't ask for it, ignore this email.`, html: `<p>Your code to open <strong>${esc(f.doc.title)}</strong> is <strong style="font-size:1.4em">${code}</strong>.</p><p><small>It works for 10 minutes. If you didn't ask for it, ignore this email.</small></p>` }, cfg);
}

/** Checks the password and/or emailed code the signer was set up with. Ten wrong tries lock the link until a fresh one is sent. */
export async function unlock(token: string, password: string, code: string) {
  const f = await byToken(token);
  if (!f) throw new Error("This signing link isn't valid.");
  const c = await conn(), r = (await c.query("SELECT pw_hash, verify_email, code_hash, code_exp > now() AS fresh, tries FROM sign_signers WHERE id = $1", [f.signer.id])).rows[0];
  if (r.tries >= 10) throw new Error("Too many wrong tries. Ask for a new signing link.");
  const bad = (r.pw_hash && !checkPw(password.slice(0, 200), r.pw_hash)) || (r.verify_email && !(r.fresh && r.code_hash && r.code_hash === hashTok(code.trim() + ":" + f.signer.id)));
  if (bad) { await c.query("UPDATE sign_signers SET tries = tries + 1 WHERE id = $1", [f.signer.id]); throw new Error(r.verify_email && !r.fresh ? "Ask for a code first (or it expired)." : "That didn't match. Check the password and code and try again."); }
  await c.query("UPDATE sign_signers SET tries = 0, code_hash = '' WHERE id = $1", [f.signer.id]);
  return f.signer.id;
}

// ---- email
/** Makes a fresh personal link for a signer (retiring any earlier one) and counts it as sent. */
async function newLink(signerId: number, base: string) {
  const token = randomBytes(32).toString("hex");
  await (await conn()).query("UPDATE sign_signers SET token = $2, sent_at = now(), tries = 0 WHERE id = $1 AND signed_at IS NULL", [signerId, hashTok(token)]);
  return `${base}/sign/${token}`;
}
/** Email one person their link now (or, with `copyOnly`, just hand back the link for the admin to send some other way). */
export async function sendOne(docId: number, signerId: number, who: string, base: string, copyOnly: boolean) {
  const c = await conn(), d = (await c.query("SELECT title, message, created_by, status FROM sign_docs WHERE id = $1 AND kind = 'board'", [docId])).rows[0];
  const s = (await c.query("SELECT id, name, email, role, signed_at FROM sign_signers WHERE id = $1 AND doc_id = $2", [signerId, docId])).rows[0];
  if (d?.status !== "open" || !s || s.signed_at || s.role === "cc") throw new Error("That person can't be sent a link right now.");
  if (copyOnly) { await logAudit(who, "board.sign.link", `${d.title} (#${docId}) for ${s.email}`); return await newLink(s.id, base); }
  await mailSigner(d, s, base, false);
  await logAudit(who, "board.sign.send", `${d.title} (#${docId}) to ${s.email}`);
  return "";
}
/** Mark that the signer opened their link (shown live on the paper). */
export const markOpened = async (signerId: number) => void (await (await conn()).query("UPDATE sign_signers SET viewed_at = COALESCE(viewed_at, now()) WHERE id = $1 AND signed_at IS NULL", [signerId]));

// ---- remembered contacts: anyone you've added to a paper stays suggestable for 6 months after you last used them
export async function recentContacts(q: string) {
  const c = await conn(), like = "%" + clip(q, 50).replace(/[\\%_]/g, "\\$&") + "%";
  await c.query("DELETE FROM sign_contacts WHERE last_used < now() - interval '6 months'");
  return (await c.query("SELECT name, email FROM sign_contacts WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY last_used DESC LIMIT 15", [like])).rows as { name: string; email: string }[];
}
async function mailSigner(doc: { title: string; message: string; created_by: string }, s: { id: number; name: string; email: string; role: Role }, base: string, reminder: boolean) {
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email isn't set up yet (see the mail Settings), so signing links can't be sent.");
  const link = await newLink(s.id, base), t = esc(doc.title), ask = { signer: "your signature on", approver: "your approval of", viewer: "you to read" }[s.role as "signer"] ?? "your signature on", msg = doc.message.trim();
  await send({ to: s.email, subject: `${reminder ? "Reminder: " : ""}${s.role === "viewer" ? "Please review" : s.role === "approver" ? "Please approve" : "Please sign"}: ${doc.title}`,
    text: `Hi ${s.name},\n\n${reminder ? "A friendly reminder: " : ""}Kzoo Makers needs ${ask} "${doc.title}".\n${msg ? `\n${msg}\n` : ""}\nOpen it here: ${link}\n\nThe link is personal to you, so please don't forward it.`,
    html: `<p>Hi ${esc(s.name)},</p><p>${reminder ? "A friendly reminder: " : ""}Kzoo Makers needs ${ask} <strong>${t}</strong>.</p>${msg ? `<p style="white-space:pre-wrap">${esc(msg)}</p>` : ""}<p><a href="${link}">Open the document</a></p><p><small>The link is personal to you, so please don't forward it.</small></p>` }, cfg);
}

/** Emails whoever's turn it has come (everyone, or the next order group when signing is sequential) and hasn't been sent a link yet. Returns the addresses that failed. */
async function advance(docId: number, base: string) {
  const c = await conn(), d = (await c.query("SELECT title, message, created_by, sequential, status FROM sign_docs WHERE id = $1", [docId])).rows[0];
  if (d?.status !== "open") return [];
  const ss = (await c.query("SELECT id, name, email, role, ord, sent_at, signed_at FROM sign_signers WHERE doc_id = $1 AND role <> 'cc'", [docId])).rows, failed: string[] = [];
  for (const s of ss.filter((s) => !s.sent_at && (!d.sequential || ss.every((o) => o.ord >= s.ord || o.signed_at)))) await mailSigner(d, s, base, false).catch(() => failed.push(s.email));
  return failed;
}

// ---- input checks shared by papers and templates
const pdfInfo = async (pdf: string | Buffer) => {
  const buf = typeof pdf === "string" ? Buffer.from(pdf, "base64") : pdf;
  if (buf.length > 8_000_000 || buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("That isn't a PDF, or it's over 8 MB.");
  const n = await PDFDocument.load(buf, { ignoreEncryption: true }).then((d) => d.getPageCount()).catch(() => { throw new Error("That PDF couldn't be read."); });
  if (n > 200) throw new Error("PDFs over 200 pages aren't supported.");
  return { buf, pages: n };
};

/** Normalises recipients, fields and options. A template keeps blank emails (slots a public-link visitor fills) and never keeps passwords. */
export function cleanSetup(n: Setup, pages: number, template: boolean) {
  const signers = (n.signers ?? []).map((s) => ({ name: clip(s.name, 100), email: clip(s.email, 200).toLowerCase(), role: (ROLES as readonly string[]).includes(s.role as string) ? (s.role as Role) : "signer" as Role, ord: Math.round(num(s.ord ?? 1, 1, 50)) || 1, password: template ? "" : clip(s.password, 100), verify: !!s.verify })).filter((s) => s.name || s.email);
  if (!signers.length || signers.length > 50) throw new Error("Add between 1 and 50 people.");
  if (signers.some((s) => !s.name || (!template || s.email) && !EMAIL_OK.test(s.email))) throw new Error("Every person needs a name and a valid email address.");
  if (new Set(signers.map((s) => s.email).filter(Boolean)).size !== signers.filter((s) => s.email).length) throw new Error("Each person can only be listed once.");
  if (!signers.some((s) => s.role === "signer" || s.role === "approver")) throw new Error("At least one person has to be a signer or approver.");
  const redirect = clip(n.redirect_url, 500);
  if (redirect && !/^https?:\/\/[^\s]+$/.test(redirect)) throw new Error("The redirect address must start with http:// or https://.");
  const fields = (pages ? (n.fields ?? []) : []).slice(0, 500).map((f) => ({ r: Math.round(Number(f.r)), type: String(f.type), page: Math.round(Number(f.page)), x: num(f.x, 0, 100), y: num(f.y, 0, 100), w: num(f.w, 1, 100), h: num(f.h, 1, 100), label: clip(f.label, 100), options: list(f.options, 20, 100), required: f.required !== false }));
  for (const f of fields) {
    if (!(FIELD_TYPES as readonly string[]).includes(f.type) || !(f.r >= 0 && f.r < signers.length) || !(f.page >= 1 && f.page <= pages)) throw new Error("A field is on a page or person that doesn't exist.");
    if (!["signer", "approver"].includes(signers[f.r].role)) throw new Error(`${signers[f.r].name} can only ${signers[f.r].role === "viewer" ? "view" : "receive a copy of"} this, so they can't have fields.`);
    if (f.type === "dropdown" && !f.options.length) throw new Error("A dropdown needs at least one choice.");
  }
  if (pages && signers.some((s, i) => ["signer", "approver"].includes(s.role) && !fields.some((f) => f.r === i && f.type === "signature"))) throw new Error("Every signer and approver needs a signature field placed on the PDF.");
  const actors = signers.filter((s) => s.role === "signer" || s.role === "approver").length, needed = Math.max(0, Math.min(Number(n.needed) || 0, actors));
  return { signers, fields, redirect, needed: needed === actors ? 0 : needed, message: clip(n.message, 2000), sequential: !!n.sequential, hide_audit: !!n.hide_audit, tags: list(n.tags, 20, 40), present: list(n.present, 100, 100) };
}

// ---- create / manage
/** `direct` = index of the recipient who is signing right now on a public link: they're handed their link instead of being emailed. */
export async function createDoc(n: NewDoc, who: string, base: string, direct = -1) {
  const title = clip(n.title, 200), body = clip(n.body, 60000), pdf = n.pdf ? await pdfInfo(n.pdf) : null;
  if (!title || (!body && !pdf)) throw new Error("A title and either the document text or a PDF are required.");
  const k = cleanSetup(n, pdf?.pages ?? 0, false), due = n.due_at ? new Date(n.due_at) : null;
  if (due && isNaN(+due)) throw new Error("That due date doesn't look right.");
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email isn't set up yet (see the mail Settings), so signing links can't be sent.");
  const c = await conn();
  const id = (await c.query("INSERT INTO sign_docs (kind, title, body, source, message, redirect_url, hide_audit, sequential, bucket_id, tags, present, needed, due_at, created_by) VALUES ('board',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
    [title, body || title, pdf ? seal(pdf.buf) : null, k.message, k.redirect, k.hide_audit, k.sequential, n.bucket_id || null, k.tags, k.present, k.needed, due, who])).rows[0].id as number;
  const ids: number[] = [];
  for (const s of k.signers) ids.push((await c.query("INSERT INTO sign_signers (doc_id, name, email, token, role, ord, pw_hash, verify_email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    [id, s.name, s.email, randomBytes(8).toString("hex"), s.role, k.sequential ? s.ord : 1, s.password ? hashPw(s.password) : "", s.verify])).rows[0].id);
  for (const f of k.fields) await c.query("INSERT INTO sign_fields (doc_id, signer_id, type, page, x, y, w, h, label, options, required) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [id, ids[f.r], f.type, f.page, f.x, f.y, f.w, f.h, f.label, f.options, f.required]);
  await logAudit(who, "board.sign.create", `${title} (#${id})`);
  if (who !== "public link") for (const s of k.signers) await c.query("INSERT INTO sign_contacts (email, name) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET name = $2, last_used = now()", [s.email, s.name]);
  let token = "";
  if (direct >= 0) { token = randomBytes(32).toString("hex"); await c.query("UPDATE sign_signers SET token = $2, sent_at = now() WHERE id = $1", [ids[direct], hashTok(token)]); }
  return { id, failed: n.hold && direct < 0 ? [] : await advance(id, base), token };
}

export async function remind(id: number, who: string, base: string) {
  const d = await getDoc(id);
  if (!d || d.status !== "open") throw new Error("Only open documents can be reminded.");
  const todo = d.signers.filter((s) => !s.signed_at && s.sent_at && s.role !== "cc");
  for (const s of todo) await mailSigner(d, s, base, true);
  await advance(id, base);
  await logAudit(who, "board.sign.remind", `${d.title} (#${id})`);
  return todo.length;
}

export async function voidDoc(id: number, who: string) {
  const r = await (await conn()).query("UPDATE sign_docs SET status = 'void' WHERE id = $1 AND kind = 'board' AND status = 'open' RETURNING title", [id]);
  if (!r.rowCount) throw new Error("Only open documents can be voided.");
  await logAudit(who, "board.sign.void", `${r.rows[0].title} (#${id})`);
}

export async function setDue(id: number, due: string | null) {
  const d = due ? new Date(due) : null;
  if (d && isNaN(+d)) throw new Error("That due date doesn't look right.");
  await (await conn()).query("UPDATE sign_docs SET due_at = $2, status = CASE WHEN status = 'expired' AND ($2 IS NULL OR $2 > now()) THEN 'open' ELSE status END WHERE id = $1 AND kind = 'board'", [id, d]);
}

/** Final signed PDF, decrypted. */
export async function signedKind(id: number) { return (await (await conn()).query("SELECT kind FROM sign_docs WHERE id = $1 AND status = 'complete'", [id])).rows[0]?.kind as string | undefined; }
export async function signedPdf(id: number) {
  const r = (await (await conn()).query("SELECT title, kind, pdf FROM sign_docs WHERE id = $1 AND status = 'complete'", [id])).rows[0];
  return r?.pdf ? { title: r.title as string, kind: r.kind as string, pdf: open(r.pdf) } : null;
}

// ---- the signer's side
export const sourcePdf = async (docId: number) => { const r = (await (await conn()).query("SELECT source FROM sign_docs WHERE id = $1", [docId])).rows[0]; return r?.source ? open(r.source) : null; };

export async function byToken(token: string) {
  const c = await conn();
  await c.query("UPDATE sign_docs SET status = 'expired' WHERE status = 'open' AND due_at < now()");
  const s = (await c.query("SELECT id, doc_id, name, email, role, ord, signed_at, declined_at, (pw_hash <> '' OR verify_email) AS locked, pw_hash <> '' AS has_pw, verify_email FROM sign_signers WHERE token = $1 AND role <> 'cc'", [hashTok(token.slice(0, 100))])).rows[0];
  if (!s) return null;
  const d = (await c.query("SELECT id, title, body, source IS NOT NULL AS has_pdf, message, redirect_url, tags, present, status, due_at, hide_audit FROM sign_docs WHERE id = $1 AND kind = 'board'", [s.doc_id])).rows[0];
  if (!d) return null;
  const fields = d.has_pdf ? (await c.query("SELECT id, type, page, x, y, w, h, label, options, required FROM sign_fields WHERE signer_id = $1 ORDER BY id", [s.id])).rows : [];
  return { signer: s as { id: number; name: string; email: string; role: Role; ord: number; signed_at: string | null; declined_at: string | null; locked: boolean; has_pw: boolean; verify_email: boolean }, doc: d as { id: number; title: string; body: string; has_pdf: boolean; message: string; redirect_url: string; hide_audit: boolean; tags: string[]; present: string[]; status: string; due_at: string | null }, fields: fields as { id: number; type: string; page: number; x: number; y: number; w: number; h: number; label: string; options: string[]; required: boolean }[] };
}

export type Proof = { ip: string; ua: string };
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]{20,150000}$/;
export type SignInput = { signature: string; drawn: string; initials: string; values: Record<string, unknown> };

/** `ok` = the caller already verified this signer's password / emailed code (see unlocked()). */
export async function signByToken(token: string, input: SignInput, proof: Proof, base: string, ok: boolean) {
  const f = await byToken(token), signature = clip(input.signature, 100), initials = clip(input.initials, 6).toUpperCase();
  if (!f) throw new Error("This signing link isn't valid.");
  if (f.signer.locked && !ok) throw new Error("Enter your password or code first.");
  if (f.doc.status !== "open") throw new Error(f.doc.status === "complete" ? "This document already has all the signatures it needs." : "This document is no longer open for signing.");
  if (f.signer.signed_at || f.signer.declined_at) throw new Error("You've already responded to this document.");
  if (f.signer.role === "viewer") await (await conn()).query("UPDATE sign_signers SET signed_at = now(), ip = $2, ua = $3 WHERE id = $1 AND signed_at IS NULL", [f.signer.id, proof.ip.slice(0, 64), proof.ua.slice(0, 300)]);
  else {
    if (signature.length < 2) throw new Error("Type your full name to sign.");
    const c = await conn(), vals: [number, string][] = [];
    for (const fl of f.fields) {
      const raw = input.values?.[fl.id];
      if (fl.type === "initials" && fl.required && !initials) throw new Error("Enter your initials.");
      if (!["text", "checkbox", "dropdown"].includes(fl.type)) continue;
      const v = fl.type === "checkbox" ? (raw === true || raw === "true" ? "true" : "") : clip(raw, 500);
      if (fl.type === "dropdown" && v && !fl.options.includes(v)) throw new Error(`Pick one of the choices for "${fl.label || "the dropdown"}".`);
      if (fl.required && !v) throw new Error(`Please complete "${fl.label || fl.type}".`);
      vals.push([fl.id, v]);
    }
    for (const [id, v] of vals) await c.query("UPDATE sign_fields SET value = $2 WHERE id = $1", [id, v]);
    if (await recordSignature(f.signer.id, f.doc.id, signature, PNG.test(input.drawn) ? input.drawn : "", proof, initials)) return void (await finalize(f.doc.id, base).catch((e) => console.error("finalize failed", e)));
  }
  await advance(f.doc.id, base).catch(() => {});
}

export async function declineByToken(token: string, reason: string) {
  const f = await byToken(token);
  if (!f || f.doc.status !== "open" || f.signer.signed_at || f.signer.declined_at) throw new Error("This signing link can't be used.");
  await (await conn()).query("UPDATE sign_signers SET declined_at = now(), decline_reason = $2 WHERE id = $1", [f.signer.id, clip(reason, 500)]);
}

/** Records one signature; true if it was the one that completed the document (that caller must finalize). */
async function recordSignature(signerId: number, docId: number, signature: string, drawn: string, p: Proof, initials = "") {
  const c = await conn();
  if (!(await c.query("UPDATE sign_signers SET signed_at = now(), signature = $2, drawn = $3, ip = $4, ua = $5, initials = $6 WHERE id = $1 AND signed_at IS NULL AND declined_at IS NULL", [signerId, signature, drawn, p.ip.slice(0, 64), p.ua.slice(0, 300), initials])).rowCount) throw new Error("You've already responded to this paper.");
  return !!(await c.query(`UPDATE sign_docs d SET status = 'complete', completed_at = now() WHERE d.id = $1 AND d.status = 'open'
    AND (SELECT count(*) FROM sign_signers WHERE doc_id = d.id AND role IN ('signer','approver') AND signed_at IS NOT NULL) >= CASE WHEN d.needed > 0 THEN d.needed ELSE (SELECT count(*) FROM sign_signers WHERE doc_id = d.id AND role IN ('signer','approver')) END`, [docId])).rowCount;
}

/** A member signs the agreement (a specific version) while logged in: one document, one signer, finished immediately. */
export async function signWaiver(user: { id: number; name: string; email: string }, v: Version, signature: string, initials: string, drawn: string, proof: Proof, base: string, copyTo: string) {
  if (clip(signature, 100).length < 2) throw new Error("Type your full name to sign.");
  if (clip(initials, 6).length < 1) throw new Error("Enter your initials: they go at the foot of every page.");
  if (!PNG.test(drawn)) throw new Error("Draw your signature in the box to sign the agreement.");
  const c = await conn();
  const id = (await c.query("INSERT INTO sign_docs (kind, user_id, version_id, title, body, created_by) VALUES ('waiver',$1,$2,$3,$4,$5) RETURNING id", [user.id, v.id, `${v.title} (revision ${v.revision})`, fullText(v), user.email])).rows[0].id as number;
  const sid = (await c.query("INSERT INTO sign_signers (doc_id, name, email, token) VALUES ($1,$2,$3,$4) RETURNING id", [id, user.name, user.email, randomBytes(8).toString("hex")])).rows[0].id as number;
  await recordSignature(sid, id, clip(signature, 100), PNG.test(drawn) ? drawn : "", proof, clip(initials, 6).toUpperCase());
  await finalize(id, base, copyTo);
}

export type GuestSign = { signature: string; initials: string; drawn: string; guardian?: { name: string; signature: string; drawn: string } };
/** A guest signs a version of the guest agreement on the host's (or their own) device. A minor also needs the guardian's signature, which goes on the same document; the host is copied on the signed PDF. */
export async function signGuest(guest: { id: number; name: string; email: string }, hostEmail: string, v: Version, i: GuestSign, proof: Proof, base: string) {
  if (clip(i.signature, 100).length < 2) throw new Error("Type the guest's full name to sign.");
  if (clip(i.initials, 6).length < 1) throw new Error("Enter initials: they go at the foot of every page.");
  if (!PNG.test(i.drawn)) throw new Error("Draw the signature in the box to sign the agreement.");
  if (i.guardian && (clip(i.guardian.signature, 100).length < 2 || !PNG.test(i.guardian.drawn))) throw new Error("The parent or guardian must type their name and draw their signature.");
  const c = await conn();
  const id = (await c.query("INSERT INTO sign_docs (kind, guest_id, version_id, title, body, created_by) VALUES ('guest',$1,$2,$3,$4,$5) RETURNING id", [guest.id, v.id, `${v.title} (revision ${v.revision})`, fullText(v), hostEmail])).rows[0].id as number;
  const add = async (name: string, email: string, role = "signer") => (await c.query("INSERT INTO sign_signers (doc_id, name, email, token, role) VALUES ($1,$2,$3,$4,$5) RETURNING id", [id, name, email, randomBytes(8).toString("hex"), role])).rows[0].id as number;
  const sid = await add(guest.name, guest.email), gid = i.guardian ? await add(i.guardian.name, guest.email) : 0;
  await add("Host", hostEmail, "cc");
  const done = await recordSignature(sid, id, clip(i.signature, 100), i.drawn, proof, clip(i.initials, 6).toUpperCase());
  const last = i.guardian ? await recordSignature(gid, id, clip(i.guardian.signature, 100), i.guardian.drawn, proof) : done;
  if (last) await finalize(id, base);
}

/** Builds, digitally signs (when a certificate is configured), encrypts and stores the signed PDF, then emails it to everyone involved (and a waiver copy to the office). */
async function finalize(docId: number, base: string, copyTo = "") {
  const c = await conn(), d = (await c.query("SELECT d.*, b.name AS bucket FROM sign_docs d LEFT JOIN sign_buckets b ON b.id = d.bucket_id WHERE d.id = $1", [docId])).rows[0];
  const ss = (await c.query("SELECT id, name, email, signature, initials, drawn, signed_at AS at, ip, ua FROM sign_signers WHERE doc_id = $1 AND signed_at IS NOT NULL AND role IN ('signer','approver') ORDER BY signed_at", [docId])).rows;
  const ver: Version | undefined = (d.kind === "waiver" || d.kind === "guest") && d.version_id ? (await c.query("SELECT id, revision, title, sections, closing FROM waiver_versions WHERE id = $1", [d.version_id])).rows[0] : undefined;
  let raw: Buffer;
  if (d.source) {
    const src = open(d.source), fields = (await c.query("SELECT page, x, y, w, h, type, value, signer_id AS signer FROM sign_fields WHERE doc_id = $1 ORDER BY id", [docId])).rows;
    raw = await buildFieldPdf(src, fields, new Map(ss.map((s) => [s.id as number, s])), { title: d.title, completed: new Date(d.completed_at), hideAudit: d.hide_audit }, sha256(src));
  } else raw = ver ? await buildAgreementPdf(ver, ss[0], sha256(d.body), ss[1] ?? null) : await buildPdf({ title: d.title, body: d.body, tags: d.tags, present: d.present, completed: new Date(d.completed_at) }, ss, d.bucket, sha256(d.title + "\n" + d.body), d.hide_audit);
  const pdf = await sealPdf(raw);
  await c.query("UPDATE sign_docs SET pdf = $2, sha = $3 WHERE id = $1", [docId, seal(pdf), sha256(pdf)]);
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) return;
  const attachments = [{ filename: d.title.replace(/[^\w.-]+/g, "_").slice(0, 60) + ".pdf", content: pdf, type: "application/pdf" }];
  const copies = (await c.query("SELECT email FROM sign_signers WHERE doc_id = $1 AND (role = 'cc' OR signed_at IS NOT NULL)", [docId])).rows.map((r) => r.email as string);
  const to = new Set([...copies, ...(copyTo ? [copyTo] : []), ...(EMAIL_OK.test(d.created_by) && d.kind === "board" ? [d.created_by] : [])]);
  for (const t of to) await send({ to: t, subject: `Signed: ${d.title}${d.kind !== "board" ? ` (${ss[0].name})` : ""}`, text: `The signed copy of "${d.title}" is attached. It is stored encrypted at rest and was sent over an encrypted connection.`,
    html: `<p>The signed copy of <strong>${esc(d.title)}</strong> is attached.</p><p><small>It is stored encrypted at rest and was sent over an encrypted connection.</small></p>`, attachments }, cfg).catch(() => {});
  await logAudit("system", d.kind === "waiver" ? "crm.waiver" : d.kind === "guest" ? "guest.sign" : "board.sign.complete", `${d.title} (#${docId})`);
}

// ---- templates: a saved setup (text or PDF, people, fields, options) to start new papers from, optionally with a public "sign this" link
export type Template = { id: number; title: string; has_pdf: boolean; public_token: string | null; people: number; created_at: string };
export const listTemplates = async () => (await (await conn()).query("SELECT id, title, source IS NOT NULL AS has_pdf, direct_token AS public_token, jsonb_array_length(setup->'signers') AS people, created_at FROM sign_templates ORDER BY lower(title)")).rows as Template[];

export async function saveTemplate(n: NewDoc, who: string) {
  const title = clip(n.title, 200), body = clip(n.body, 60000), pdf = n.pdf ? await pdfInfo(n.pdf) : null;
  if (!title || (!body && !pdf)) throw new Error("A title and either the document text or a PDF are required.");
  const k = cleanSetup(n, pdf?.pages ?? 0, true);
  const setup: Setup = { message: k.message, redirect_url: k.redirect, hide_audit: k.hide_audit, sequential: k.sequential, needed: k.needed, tags: k.tags, present: k.present, fields: k.fields,
    signers: k.signers.map((s) => ({ name: s.name, email: s.email, role: s.role, ord: s.ord, verify: s.verify })) };
  const id = (await (await conn()).query("INSERT INTO sign_templates (title, body, source, setup, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [title, body, pdf ? seal(pdf.buf) : null, JSON.stringify(setup), who])).rows[0].id as number;
  await logAudit(who, "board.sign.template", `${title} (#${id})`);
  return id;
}
/** The template as the editor wants it: its setup plus the PDF (base64) when it has one. */
export async function getTemplate(id: number) {
  const r = (await (await conn()).query("SELECT title, body, source, setup FROM sign_templates WHERE id = $1", [id])).rows[0];
  if (!r) throw new Error("That template no longer exists.");
  return { title: r.title as string, body: r.body as string, pdf: r.source ? open(r.source).toString("base64") : "", ...(r.setup as Setup) };
}
export const deleteTemplate = async (id: number) => void (await (await conn()).query("DELETE FROM sign_templates WHERE id = $1", [id]));
/** Turns the public link on (a template needs one blank-email slot for the visitor) or off. */
export async function setPublic(id: number, on: boolean) {
  const t = await getTemplate(id);
  if (on && !t.signers.some((s) => !s.email && (s.role ?? "signer") !== "cc")) throw new Error("Leave one person's email blank in the template: that's the place the visitor fills in.");
  return (await (await conn()).query("UPDATE sign_templates SET direct_token = $2 WHERE id = $1 RETURNING direct_token", [id, on ? randomBytes(18).toString("hex") : null])).rows[0]?.direct_token as string | null;
}

export async function publicTemplate(token: string) {
  const r = (await (await conn()).query("SELECT id, title FROM sign_templates WHERE direct_token = $1", [token.slice(0, 80)])).rows[0];
  return r as { id: number; title: string } | undefined;
}
/** A visitor on a template's public link starts their own copy; returns their personal signing link token. */
export async function startPublic(token: string, name: string, email: string, base: string) {
  const t = await publicTemplate(token);
  if (!t) throw new Error("This link is no longer active.");
  const { title, ...rest } = await getTemplate(t.id), slot = rest.signers.findIndex((s) => !s.email && (s.role ?? "signer") !== "cc");
  if (slot < 0) throw new Error("This link is no longer active.");
  if (rest.sequential && rest.signers.some((s) => (s.ord ?? 1) < (rest.signers[slot].ord ?? 1))) throw new Error("This link isn't set up correctly (the visitor must sign first).");
  rest.signers[slot] = { ...rest.signers[slot], name: clip(name, 100), email: clip(email, 200).toLowerCase() };
  const r = await createDoc({ ...rest, title }, "public link", base, slot);
  return r.token;
}

