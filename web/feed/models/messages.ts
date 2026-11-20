import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { feedOrigin } from "../config";
import { SITE_NAME } from "../format";
import { feedMail, feedPush, type Push } from "../mail";
import { hatId } from "./hats";
import { insertNote } from "./mod-notes";
import { live, tx } from "./submit";
import { renderPost } from "./render";

// Private messages (message.rb, messages_controller, notify_message_job.rb). A message is visible to its author and recipient, each deleting their own copy; it is gone once both have.

export const SUBJECT_MAX = 100, BODY_MIN = 5, BODY_MAX = 8192;
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; errors: string[] };
const SHORT = "abcdefghijklmnopqrstuvwxyz0123456789";
const shortId = () => Array.from(randomBytes(6), (b) => SHORT[b % 36]).join("");
const bad = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });
const token = (p: string) => `${p}_${randomBytes(16).toString("hex")}`;

export type Row = { short_id: string; subject: string; created_at: Date; unread: boolean; author: string | null; recipient: string; hat: string | null };

/** The viewer's inbox (`dir` "in") or sent box ("out"), oldest first as in Lobsters. */
export async function listMessages(userId: number, dir: "in" | "out"): Promise<Row[]> {
  const col = dir === "in" ? "recipient_user_id" : "author_user_id", flag = dir === "in" ? "deleted_by_recipient" : "deleted_by_author";
  return (await (await conn()).query(
    `SELECT m.short_id, m.subject, m.created_at, a.username AS author, r.username AS recipient, h.hat, (n.id IS NOT NULL AND n.read_at IS NULL) AS unread
     FROM feed.messages m JOIN feed.users r ON r.id = m.recipient_user_id LEFT JOIN feed.users a ON a.id = m.author_user_id LEFT JOIN feed.hats h ON h.id = m.hat_id
     LEFT JOIN feed.notifications n ON n.notifiable_type = 'Message' AND n.notifiable_id = m.id AND n.user_id = m.recipient_user_id
     WHERE m.${col} = $1 AND NOT m.${flag} ORDER BY m.id LIMIT 1000`, [userId])).rows;
}

export type Shown = { short_id: string; subject: string; created_at: Date; author: string | null; recipient: string; hat: string | null; html: string; replyTo: string | null };
/** One message, or null unless the viewer wrote or received it. Opening it as the recipient marks it read. */
export async function getMessage(userId: number, sid: string): Promise<Shown | null> {
  const db = await conn();
  const m = (await db.query(
    `SELECT m.id, m.short_id, m.subject, m.body, m.created_at, m.author_user_id, m.recipient_user_id, a.username AS author, r.username AS recipient, h.hat
     FROM feed.messages m JOIN feed.users r ON r.id = m.recipient_user_id LEFT JOIN feed.users a ON a.id = m.author_user_id LEFT JOIN feed.hats h ON h.id = m.hat_id
     WHERE m.short_id = $1 AND (m.author_user_id = $2 OR m.recipient_user_id = $2)`, [sid, userId])).rows[0];
  if (!m) return null;
  if (Number(m.recipient_user_id) === userId) await db.query("UPDATE feed.notifications SET read_at = COALESCE(read_at, now()), updated_at = now() WHERE user_id = $1 AND notifiable_type = 'Message' AND notifiable_id = $2", [userId, m.id]);
  return { short_id: m.short_id, subject: m.subject, created_at: m.created_at, author: m.author, recipient: m.recipient, hat: m.hat, html: await renderPost(db as unknown as PoolClient, m.body),
    replyTo: m.author ? (Number(m.author_user_id) === userId ? m.recipient : m.author) : null };
}

export type Draft = { to: string; subject: string; body: string; modNote: boolean; hat?: string };

/** messages#create: validates, stores, notifies the recipient (a notification row, and an email if they chose it). A moderator can also copy it into the other person's mod notes. */
export async function sendMessage(user: { id: number }, d: Draft): Promise<Result<{ to: string }>> {
  const subject = d.subject.trim(), body = d.body.replace(/\r\n/g, "\n").trim(), errors: string[] = [];
  if (!subject || subject.length > SUBJECT_MAX) errors.push(`Subject must be 1 to ${SUBJECT_MAX} characters`);
  if (body.length < BODY_MIN || body.length > BODY_MAX) errors.push(`Body must be ${BODY_MIN} to ${BODY_MAX} characters`);
  if (errors.length) return bad(...errors);
  const mails: { to: string; subject: string; text: string }[] = [], pushes: Push[] = [];
  const r = await tx<Result<{ to: string }>>(async (c) => {
    const me = await live(c, user.id);
    if (!me || me.banned_at || me.deleted_at) return bad("You can't send messages.");
    const rcpt = (await c.query("SELECT id, username, email, settings FROM feed.users WHERE lower(username) = lower($1)", [d.to.trim()])).rows[0];
    if (!rcpt) return bad("Recipient username is not a valid user");
    const from = (await c.query("SELECT username FROM feed.users WHERE id = $1", [user.id])).rows[0].username;
    const hat = await hatId(c, user.id, d.hat);
    let m;
    do m = (await c.query("INSERT INTO feed.messages (author_user_id, recipient_user_id, subject, body, short_id, token, created_at, hat_id) VALUES ($1, $2, $3, $4, $5, $6, now(), $7) ON CONFLICT (short_id) DO NOTHING RETURNING id, short_id, created_at", [user.id, rcpt.id, subject, body, shortId(), token("message"), hat])).rows[0];
    while (!m); // the unique index on short_id settles a clash: draw another
    await c.query("INSERT INTO feed.notifications (user_id, notifiable_type, notifiable_id, token) VALUES ($1, 'Message', $2, $3)", [rcpt.id, m.id, token("notification")]);
    if (me.is_moderator && d.modNote) { // mod_note.rb create_from_message: filed under the other party, as the author is the moderator here
      await insertNote(c, user.id, Number(rcpt.id), `*${from} -> ${rcpt.username}*: ${subject}\n\n${body}\n`);
    }
    if (rcpt.email && rcpt.settings?.email_messages === true) mails.push({ to: rcpt.email, subject: `[${SITE_NAME}] Private Message from ${from}: ${subject}`, text: `${body}\n\nReply at ${feedOrigin()}/messages/${m.short_id}\n` });
    if (rcpt.settings?.pushover_user_key && rcpt.settings?.pushover_messages === true) pushes.push({ key: rcpt.settings.pushover_user_key, title: `${SITE_NAME} message from ${from}: ${subject}`, message: body, click: `${feedOrigin()}/messages/${m.short_id}` });
    return { ok: true, to: rcpt.username };
  });
  if (r.ok) { for (const x of pushes) await feedPush(x); for (const x of mails) await feedMail(x.to, x.subject, x.text); } // after the commit: a slow mail server never holds the send open
  return r;
}

/** Deletes the viewer's copy of each message they wrote or received; a message deleted by both is removed with its notification. Returns how many were deleted. */
export const deleteMessages = (userId: number, sids: string[]): Promise<number> => tx(async (c) => {
  let n = 0;
  for (const sid of sids) {
    const m = (await c.query("SELECT id, author_user_id, recipient_user_id FROM feed.messages WHERE short_id = $1 FOR UPDATE", [sid])).rows[0];
    if (!m) continue;
    const a = Number(m.author_user_id) === userId, r = Number(m.recipient_user_id) === userId;
    if (!a && !r) continue;
    const u = (await c.query("UPDATE feed.messages SET deleted_by_author = deleted_by_author OR $2, deleted_by_recipient = deleted_by_recipient OR $3 WHERE id = $1 RETURNING deleted_by_author AND deleted_by_recipient AS gone", [m.id, a, r])).rows[0];
    if (u.gone) { await c.query("DELETE FROM feed.notifications WHERE notifiable_type = 'Message' AND notifiable_id = $1", [m.id]); await c.query("DELETE FROM feed.messages WHERE id = $1", [m.id]); }
    n++;
  }
  return n;
});

/** messages#keep_as_new: marks the viewer's received message unread again. */
export async function keepAsNew(userId: number, sid: string): Promise<void> {
  await (await conn()).query("UPDATE feed.notifications SET read_at = NULL, updated_at = now() WHERE user_id = $1 AND notifiable_type = 'Message' AND notifiable_id = (SELECT id FROM feed.messages WHERE short_id = $2 AND recipient_user_id = $1)", [userId, sid]);
}

/** messages#mod_note: a moderator copies a message they wrote or received into the other person's notes. */
export const noteMessage = (userId: number, sid: string): Promise<Result> => tx(async (c) => {
  const me = await live(c, userId);
  if (!me?.is_moderator || me.banned_at || me.deleted_at) return bad("not permitted");
  const m = (await c.query(
    `SELECT m.subject, m.body, m.author_user_id, m.recipient_user_id, a.username AS author, r.username AS recipient, h.hat FROM feed.messages m JOIN feed.users r ON r.id = m.recipient_user_id LEFT JOIN feed.users a ON a.id = m.author_user_id LEFT JOIN feed.hats h ON h.id = m.hat_id
     WHERE m.short_id = $1 AND (m.author_user_id = $2 OR m.recipient_user_id = $2)`, [sid, userId])).rows[0];
  if (!m) return bad("Could not find message.");
  const other = Number(m.recipient_user_id) === userId && m.author_user_id ? Number(m.author_user_id) : Number(m.recipient_user_id);
  await insertNote(c, userId, other, `*${m.author ?? "(System)"} ${m.hat ? `(${m.hat}) ` : ""}-> ${m.recipient}*: ${m.subject}\n\n${m.body}\n`);
  return { ok: true };
});
