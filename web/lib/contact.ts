import { db } from "./db";
import { getMailCfg, mailReady, sendQueued as send } from "./mail";
import { judge } from "./spam";

export type Kind = "contact" | "board" | "donation";
export type Status = "sent" | "held" | "rejected";
export type Message = { id: number; kind: Kind; name: string; email: string; subject: string; message: string; status: Status; reason: string; created_at: string };
export const TO: Record<Kind, string> = { contact: "contact@kzoomakers.org", board: "board@kzoomakers.org", donation: "contact@kzoomakers.org" };
const LABEL: Record<Kind, string> = { contact: "Contact form", board: "Board contact form", donation: "Donation offer" };
export const MAX = 3000;
const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Website contact forms (kind: contact | board | donation). Clean messages are emailed at once ("sent"); filter-caught ones wait "held" for an admin.
let ready: Promise<unknown> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= (async () => {
    await d.pool.query(`CREATE TABLE IF NOT EXISTS contact_messages (id serial PRIMARY KEY, kind text NOT NULL, name text NOT NULL, email text NOT NULL, subject text NOT NULL DEFAULT '',
      message text NOT NULL, status text NOT NULL DEFAULT 'held', reason text NOT NULL DEFAULT '', ip_hash text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
      decided_at timestamptz, decided_by text NOT NULL DEFAULT '')`);
    await d.pool.query("ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS token text NOT NULL DEFAULT gen_random_uuid()::text"); // the visitor's reply link
    await d.pool.query("CREATE UNIQUE INDEX IF NOT EXISTS contact_messages_token ON contact_messages (token)");
    await d.pool.query(`CREATE TABLE IF NOT EXISTS contact_replies (id serial PRIMARY KEY, message_id int NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE, author_kind text NOT NULL, author text NOT NULL,
      body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await d.pool.query("CREATE INDEX IF NOT EXISTS contact_messages_ip ON contact_messages (ip_hash, created_at)");
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}

/** Emails one stored message to its board/contact inbox; the visitor's address goes in Reply-To so "reply" just works. */
async function deliver(m: Pick<Message, "kind" | "name" | "email" | "subject" | "message">) {
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email sending isn't set up yet (Email → Settings)");
  await send({
    to: TO[m.kind], headers: { "Reply-To": m.email },
    subject: `[${LABEL[m.kind]}] ${m.subject || `Message from ${m.name}`}`.replace(/[\r\n]+/g, " ").slice(0, 200),
    text: `${m.message}\n\n— ${m.name} <${m.email}>`,
    html: `<p style="white-space:pre-wrap">${esc(m.message)}</p><p>— ${esc(m.name)} &lt;${esc(m.email)}&gt;</p>`,
  }, cfg);
}

/**
 * A visitor submits a form. Clean messages are emailed immediately; anything the filter dislikes (Cyrillic, links, blocked patterns,
 * repeats) is saved as "held" and looks accepted, so spammers learn nothing. Returns normally in both cases.
 */
export async function submitContact(kind: Kind, b: { name: string; email: string; subject: string; message: string }, ipHash: string) {
  const name = b.name.trim().slice(0, 100), email = b.email.trim().slice(0, 200), subject = b.subject.trim().slice(0, 150), message = b.message.trim();
  if (!name || !EMAIL_OK.test(email)) throw new Error("Please enter your name and a valid email address.");
  if (message.length < 10 || message.length > MAX) throw new Error(`Please write between 10 and ${MAX} characters.`);
  const c = await conn();
  const recent = (await c.query("SELECT count(*) FILTER (WHERE ip_hash = $1)::int AS mine, count(*)::int AS everyone FROM contact_messages WHERE created_at > now() - interval '1 hour'", [ipHash])).rows[0];
  if (recent.mine >= 5 || recent.everyone >= 30) throw new Error("Too many messages right now. Please try again later."); // the global cap stops a bot that gets around the per-address one
  const dup = !!(await c.query("SELECT 1 FROM contact_messages WHERE email = $1 AND message = $2 AND created_at > now() - interval '1 day'", [email, message])).rowCount;
  const v = judge(`${name}\n${subject}\n${message}`, { mode: "none", blocked: [], priorApproved: 0, duplicate: dup });
  let status: Status = v.status === "approved" ? "sent" : "held", reason = v.reason;
  if (status === "sent") await deliver({ kind, name, email, subject, message }).catch((e) => { status = "held"; reason = `Not emailed: ${e.message}`; });
  await c.query("INSERT INTO contact_messages (kind, name, email, subject, message, status, reason, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [kind, name, email, subject, message, status, reason, ipHash]);
}

export async function listMessages(status: string, kind?: string): Promise<Message[]> {
  if (!db()) return [];
  return (await (await conn()).query("SELECT id, kind, name, email, subject, message, status, reason, created_at FROM contact_messages WHERE ($1 = 'all' OR status = $1) AND ($2::text IS NULL OR kind = $2) ORDER BY id DESC LIMIT 200", [status, kind || null])).rows;
}
export async function messageCounts(kind?: string): Promise<Record<string, number>> {
  if (!db()) return {};
  return Object.fromEntries((await (await conn()).query("SELECT status, count(*)::int AS n FROM contact_messages WHERE ($1::text IS NULL OR kind = $1) GROUP BY status", [kind || null])).rows.map((r) => [r.status, r.n]));
}

/** Approve emails it now (and only marks it sent if that worked); reject keeps it for the record; restore puts it back in the held queue. */
export async function decideMessage(id: number, action: "approve" | "reject" | "restore", who: string) {
  const c = await conn(), m = (await c.query("SELECT * FROM contact_messages WHERE id = $1", [id])).rows[0];
  if (!m) throw new Error("No such message.");
  const status = { approve: "sent", reject: "rejected", restore: "held" }[action];
  // Claim the row first so two clicks can't both send it; if sending fails the old status goes back.
  const claimed = await c.query("UPDATE contact_messages SET status = $2, decided_at = now(), decided_by = $3 WHERE id = $1 AND status = $4 RETURNING id", [id, status, who, m.status]);
  if (action !== "approve" || !claimed.rowCount || m.status === "sent") return;
  await deliver(m).catch(async (e) => { await c.query("UPDATE contact_messages SET status = $2 WHERE id = $1", [id, m.status]); throw e; });
}
/** Held messages waiting for an admin, with the newest id (the admin pop-up uses it to know what is new). */
export async function heldSummary() {
  if (!db()) return { n: 0, max: 0 };
  return (await (await conn()).query("SELECT count(*)::int AS n, COALESCE(max(id), 0)::int AS max FROM contact_messages WHERE status = 'held'")).rows[0] as { n: number; max: number };
}
export const deleteMessage = async (id: number) => void (await (await conn()).query("DELETE FROM contact_messages WHERE id = $1", [id]));

// ---- conversations: staff reply by email, the visitor answers from a link, every staff email is copied to the inbox with the thread so far
export type Msg = { id: number; kind: "staff" | "visitor" | "note"; author: string; body: string; created_at: string };
/** The original message first (as the visitor's), then the replies. */
export async function thread(id: number, internal = true): Promise<Msg[]> {
  const c = await conn(), m = (await c.query("SELECT name, message, created_at FROM contact_messages WHERE id = $1", [id])).rows[0];
  if (!m) throw new Error("No such message.");
  const rows = (await c.query("SELECT id, author_kind AS kind, author, body, created_at FROM contact_replies WHERE message_id = $1 ORDER BY id", [id])).rows as Msg[];
  return [{ id: 0, kind: "visitor" as const, author: m.name, body: m.message, created_at: m.created_at }, ...rows].filter((x) => internal || x.kind !== "note");
}
const transcript = (ms: Msg[]) => ms.map((x) => `${x.author} (${x.kind === "visitor" ? "visitor" : "Kzoo Makers"}), ${new Date(x.created_at).toLocaleString("en-US", { timeZone: "America/Detroit" })}:\n${x.body}`).join("\n\n---\n\n");
const transcriptHtml = (ms: Msg[]) => ms.map((x) => `<p style="margin:12px 0 2px;color:#555;font-size:13px"><b>${esc(x.author)}</b> (${x.kind === "visitor" ? "visitor" : "Kzoo Makers"}), ${esc(new Date(x.created_at).toLocaleString("en-US", { timeZone: "America/Detroit" }))}</p><p style="margin:0;white-space:pre-wrap">${esc(x.body)}</p>`).join("");

/** Staff reply: emailed to the visitor with a reply link, and a copy with the whole thread goes to the inbox the message came to. A note is saved for staff only. */
export async function replyStaff(id: number, body: string, internal: boolean, author: string, base: string) {
  body = body.trim().slice(0, 4000);
  if (!body) throw new Error("Write a message first.");
  const c = await conn(), m = (await c.query("SELECT kind, name, email, subject, token FROM contact_messages WHERE id = $1", [id])).rows[0];
  if (!m) throw new Error("No such message.");
  if (!internal) {
    const cfg = await getMailCfg();
    if (!mailReady(cfg)) throw new Error("Email isn't set up yet, so the reply can't be sent. You can still save it as an internal note.");
    const link = `${base}/message/thread?token=${m.token}`, subject = `Re: ${m.subject || "your message to Kzoo Makers"}`.replace(/[\r\n]+/g, " ").slice(0, 200), past = await thread(id, false);
    await send({ to: m.email, subject, headers: { "Reply-To": TO[m.kind as Kind] }, text: `${author} from Kzoo Makers wrote:\n\n${body}\n\nReply here: ${link}`,
      html: `<p>${esc(author)} from Kzoo Makers wrote:</p><blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #f9b234;white-space:pre-wrap">${esc(body)}</blockquote><p><a href="${esc(link)}">Click here to reply</a></p>` }, cfg);
    const all = [...past, { id: 0, kind: "staff" as const, author, body, created_at: new Date().toISOString() }];
    await send({ to: TO[m.kind as Kind], subject: `[Copy] ${subject} (to ${m.name})`, headers: { "Reply-To": m.email }, text: `${author} replied to ${m.name} <${m.email}>. The conversation so far:\n\n${transcript(all)}`,
      html: `<p>${esc(author)} replied to ${esc(m.name)} &lt;${esc(m.email)}&gt;. The conversation so far:</p>${transcriptHtml(all)}` }, cfg).catch(() => {}); // the visitor already has theirs; a failed copy shouldn't undo it
  }
  await c.query("INSERT INTO contact_replies (message_id, author_kind, author, body) VALUES ($1,$2,$3,$4)", [id, internal ? "note" : "staff", author.slice(0, 100), body]);
}

const byToken = async (token: string) => {
  const m = (await (await conn()).query("SELECT id, kind, name, email, subject FROM contact_messages WHERE token = $1", [token])).rows[0];
  if (!m) throw new Error("This link isn't valid.");
  return m as { id: number; kind: Kind; name: string; email: string; subject: string };
};
export async function visitorThread(token: string) {
  const m = await byToken(token);
  return { title: m.subject || "Your message to Kzoo Makers", name: m.name, messages: await thread(m.id, false) };
}
/** The visitor answers from their link; the inbox gets the new reply with the thread so far. */
export async function replyVisitor(token: string, body: string, base: string) {
  body = body.trim().slice(0, 2000);
  if (!body) throw new Error("Write a message first.");
  const m = await byToken(token), c = await conn();
  if ((await c.query("SELECT count(*)::int AS n FROM contact_replies WHERE message_id = $1 AND author_kind = 'visitor' AND created_at > now() - interval '1 hour'", [m.id])).rows[0].n >= 10) throw new Error("That's a lot of messages. Please wait a bit before sending more.");
  await c.query("INSERT INTO contact_replies (message_id, author_kind, author, body) VALUES ($1,'visitor',$2,$3)", [m.id, m.name.slice(0, 100), body]);
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) return;
  const all = await thread(m.id, false);
  await send({ to: TO[m.kind], subject: `[${LABEL[m.kind]}] ${m.name} replied`, headers: { "Reply-To": m.email }, text: `${m.name} <${m.email}> replied. The conversation so far:\n\n${transcript(all)}\n\nAnswer in the admin: ${base}/admin/forms/${m.kind}`,
    html: `<p>${esc(m.name)} &lt;${esc(m.email)}&gt; replied. The conversation so far:</p>${transcriptHtml(all)}<p><a href="${esc(`${base}/admin/forms/${m.kind}`)}">Answer in the admin</a></p>` }, cfg).catch(() => {});
}
