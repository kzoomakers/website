import { db } from "./db";
import { getMailCfg, mailReady, sendQueued as send } from "./mail";
import { judge } from "./spam";

export type Kind = "contact" | "board";
export type Status = "sent" | "held" | "rejected";
export type Message = { id: number; kind: Kind; name: string; email: string; subject: string; message: string; status: Status; reason: string; created_at: string };
export const TO: Record<Kind, string> = { contact: "contact@kzoomakers.org", board: "board@kzoomakers.org" };
const LABEL: Record<Kind, string> = { contact: "Contact form", board: "Board contact form" };
export const MAX = 3000;
const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Website contact forms (kind: contact | board). Clean messages are emailed at once ("sent"); filter-caught ones wait "held" for an admin.
let ready: Promise<unknown> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= (async () => {
    await d.pool.query(`CREATE TABLE IF NOT EXISTS contact_messages (id serial PRIMARY KEY, kind text NOT NULL, name text NOT NULL, email text NOT NULL, subject text NOT NULL DEFAULT '',
      message text NOT NULL, status text NOT NULL DEFAULT 'held', reason text NOT NULL DEFAULT '', ip_hash text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
      decided_at timestamptz, decided_by text NOT NULL DEFAULT '')`);
    await d.pool.query("CREATE INDEX IF NOT EXISTS contact_messages_ip ON contact_messages (ip_hash, created_at)");
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}

/** Emails one stored message to its board/contact inbox; the visitor's address goes in Reply-To so "reply" just works. */
async function deliver(m: Pick<Message, "kind" | "name" | "email" | "subject" | "message">) {
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email sending isn't set up yet (Postmaster → Settings)");
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
export async function messageCounts(): Promise<Record<string, number>> {
  if (!db()) return {};
  return Object.fromEntries((await (await conn()).query("SELECT status, count(*)::int AS n FROM contact_messages GROUP BY status")).rows.map((r) => [r.status, r.n]));
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
