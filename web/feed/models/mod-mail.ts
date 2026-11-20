import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { feedOrigin } from "../config";
import { SITE_NAME } from "../format";
import { feedMail } from "../mail";
import { live, tx } from "./submit";
import { renderPost } from "./render";

// Mod mail (mod_mail.rb, mod_mail_message.rb, mod/mails_controller, mod_mails_controller, notify_mod_mail_message_job.rb): a subject, recipients, optional references to stories and comments, and a thread of messages.
// Moderators see every mail; anyone else sees the mails they are a recipient of. Each message notifies the other recipients by notification row and email.

export const SUBJECT_MAX = 255, MESSAGE_MIN = 20, MESSAGE_MAX = 8192;
export type MailResult<T = {}> = ({ ok: true } & T) | { ok: false; errors: string[] };
export type MailInput = { subject: string; recipients: string; commentRefs: string; storyRefs: string };
export type Viewer = { id: number; isModerator: boolean };

const SHORT = "abcdefghijklmnopqrstuvwxyz0123456789";
const shortId = () => Array.from(randomBytes(6), (b) => SHORT[b % 36]).join("");
const words = (s: string) => [...new Set(s.split(/\s+/).filter(Boolean))].slice(0, 50);
const token = () => `notification_${randomBytes(16).toString("hex")}`;
const bad = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

/** Resolves the typed names and short ids; an unknown one is an error instead of being dropped without a word. */
async function resolve(c: PoolClient, i: MailInput) {
  const errors: string[] = [], subject = i.subject.trim();
  if (!subject) errors.push("Subject can't be blank");
  if (subject.length > SUBJECT_MAX) errors.push(`Subject is too long (${SUBJECT_MAX} characters at most)`);
  const names = words(i.recipients), cids = words(i.commentRefs), sids = words(i.storyRefs);
  if (!names.length) errors.push("Recipients can't be blank");
  const users = names.length ? (await c.query("SELECT id, username FROM feed.users WHERE lower(username) = ANY($1::text[])", [names.map((n) => n.toLowerCase())])).rows : [];
  for (const n of names) if (!users.some((u) => u.username.toLowerCase() === n.toLowerCase())) errors.push(`No user named ${n}`);
  const comments = cids.length ? (await c.query("SELECT id, short_id FROM feed.comments WHERE short_id = ANY($1::text[])", [cids])).rows : [];
  for (const s of cids) if (!comments.some((x) => x.short_id === s)) errors.push(`No comment ${s}`);
  const stories = sids.length ? (await c.query("SELECT id, short_id FROM feed.stories WHERE short_id = ANY($1::text[])", [sids])).rows : [];
  for (const s of sids) if (!stories.some((x) => x.short_id === s)) errors.push(`No story ${s}`);
  return { errors, subject, users: users.map((u) => Number(u.id)), comments: comments.map((x) => Number(x.id)), stories: stories.map((x) => Number(x.id)) };
}

async function setLinks(c: PoolClient, mailId: number, r: Awaited<ReturnType<typeof resolve>>) {
  await c.query("DELETE FROM feed.mod_mail_recipients WHERE mod_mail_id = $1", [mailId]);
  await c.query("DELETE FROM feed.mod_mail_references WHERE mod_mail_id = $1", [mailId]);
  for (const u of r.users) await c.query("INSERT INTO feed.mod_mail_recipients (mod_mail_id, user_id) VALUES ($1, $2)", [mailId, u]);
  for (const [type, ids] of [["Comment", r.comments], ["Story", r.stories]] as const) for (const id of ids) await c.query("INSERT INTO feed.mod_mail_references (mod_mail_id, reference_type, reference_id) VALUES ($1, $2, $3)", [mailId, type, id]);
}

const moderator = async (c: PoolClient, id: number) => { const u = await live(c, id); return u && u.is_moderator && !u.banned_at && !u.deleted_at ? u : null; };

export const createModMail = (user: { id: number }, input: MailInput): Promise<MailResult<{ shortId: string }>> => tx(async (c) => {
  if (!(await moderator(c, user.id))) return bad("not permitted");
  const r = await resolve(c, input);
  if (r.errors.length) return bad(...r.errors);
  for (;;) { // the unique index on short_id settles a clash: draw another
    const sid = shortId(), m = (await c.query("INSERT INTO feed.mod_mails (subject, short_id) VALUES ($1, $2) ON CONFLICT (short_id) DO NOTHING RETURNING id", [r.subject, sid])).rows[0];
    if (!m) continue;
    await setLinks(c, m.id, r);
    return { ok: true, shortId: sid };
  }
});

export const updateModMail = (user: { id: number }, sid: string, input: MailInput): Promise<MailResult> => tx(async (c) => {
  if (!(await moderator(c, user.id))) return bad("not permitted");
  const m = (await c.query("SELECT id FROM feed.mod_mails WHERE short_id = $1 FOR UPDATE", [sid])).rows[0];
  if (!m) return bad("Can't find that mod mail");
  const r = await resolve(c, input);
  if (r.errors.length) return bad(...r.errors);
  await c.query("UPDATE feed.mod_mails SET subject = $2, updated_at = now() WHERE id = $1", [m.id, r.subject]);
  await setLinks(c, m.id, r);
  return { ok: true };
});

export type MailSummary = { short_id: string; subject: string; updated_at: Date; recipients: string[]; unread: number };
/** Moderators: every mail. Everyone else: the mails they are a recipient of. Newest activity first. */
export async function listModMails(v: Viewer): Promise<MailSummary[]> {
  return (await (await conn()).query(
    `SELECT m.short_id, m.subject, m.updated_at, COALESCE((SELECT array_agg(u.username ORDER BY u.username) FROM feed.mod_mail_recipients r JOIN feed.users u ON u.id = r.user_id WHERE r.mod_mail_id = m.id), '{}') AS recipients,
       (SELECT count(*)::int FROM feed.notifications n JOIN feed.mod_mail_messages mm ON mm.id = n.notifiable_id WHERE n.notifiable_type = 'ModMailMessage' AND n.user_id = $1 AND n.read_at IS NULL AND mm.mod_mail_id = m.id) AS unread
     FROM feed.mod_mails m ${v.isModerator ? "" : "WHERE EXISTS (SELECT 1 FROM feed.mod_mail_recipients r WHERE r.mod_mail_id = m.id AND r.user_id = $1)"} ORDER BY m.updated_at DESC, m.id DESC LIMIT 500`, [v.id])).rows;
}

export type MailPage = {
  short_id: string; subject: string; recipients: string[]; commentRefs: { short_id: string; user: string; story_short_id: string; story_title: string }[]; storyRefs: { short_id: string; title: string; user: string }[];
  messages: { id: number; username: string; created_at: Date; html: string }[];
};
/** One mail with its thread, or null when it doesn't exist or the viewer isn't a moderator or recipient. Opening it marks the viewer's notifications for it read. */
export async function getModMail(sid: string, v: Viewer): Promise<MailPage | null> {
  const db = await conn();
  const m = (await db.query("SELECT id, short_id, subject FROM feed.mod_mails WHERE short_id = $1", [sid])).rows[0];
  if (!m) return null;
  if (!v.isModerator && !(await db.query("SELECT 1 FROM feed.mod_mail_recipients WHERE mod_mail_id = $1 AND user_id = $2", [m.id, v.id])).rowCount) return null;
  const [rec, cref, sref, msgs] = await Promise.all([
    db.query("SELECT u.username FROM feed.mod_mail_recipients r JOIN feed.users u ON u.id = r.user_id WHERE r.mod_mail_id = $1 ORDER BY u.username", [m.id]),
    db.query(`SELECT c.short_id, u.username AS "user", s.short_id AS story_short_id, s.title AS story_title FROM feed.mod_mail_references r JOIN feed.comments c ON c.id = r.reference_id JOIN feed.users u ON u.id = c.user_id JOIN feed.stories s ON s.id = c.story_id WHERE r.mod_mail_id = $1 AND r.reference_type = 'Comment' ORDER BY r.id`, [m.id]),
    db.query(`SELECT s.short_id, s.title, u.username AS "user" FROM feed.mod_mail_references r JOIN feed.stories s ON s.id = r.reference_id JOIN feed.users u ON u.id = s.user_id WHERE r.mod_mail_id = $1 AND r.reference_type = 'Story' ORDER BY r.id`, [m.id]),
    db.query("SELECT mm.id, mm.message, mm.created_at, u.username FROM feed.mod_mail_messages mm JOIN feed.users u ON u.id = mm.user_id WHERE mm.mod_mail_id = $1 ORDER BY mm.created_at, mm.id", [m.id]),
  ]);
  await db.query("UPDATE feed.notifications SET read_at = now(), updated_at = now() WHERE user_id = $1 AND read_at IS NULL AND notifiable_type = 'ModMailMessage' AND notifiable_id IN (SELECT id FROM feed.mod_mail_messages WHERE mod_mail_id = $2)", [v.id, m.id]);
  const messages = [];
  for (const x of msgs.rows) messages.push({ id: Number(x.id), username: x.username, created_at: x.created_at, html: await renderPost(db as unknown as PoolClient, x.message) });
  return { short_id: m.short_id, subject: m.subject, recipients: rec.rows.map((r) => r.username), commentRefs: cref.rows, storyRefs: sref.rows, messages };
}

/** Posts a message to a mail the sender may see, then tells the other recipients (a notification row each, and an email). */
export async function sendModMailMessage(user: { id: number }, sid: string, text: string): Promise<MailResult> {
  const message = text.replace(/\r\n/g, "\n").trim();
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) return bad(`Message must be ${MESSAGE_MIN} to ${MESSAGE_MAX} characters`);
  let mails: { to: string; subject: string; body: string }[] = [];
  const r = await tx<MailResult>(async (c) => {
    const u = await live(c, user.id);
    if (!u || u.banned_at || u.deleted_at) return bad("not permitted");
    const m = (await c.query("SELECT id, subject FROM feed.mod_mails WHERE short_id = $1 FOR UPDATE", [sid])).rows[0];
    const rec = m ? (await c.query("SELECT u.id, u.email, u.username FROM feed.mod_mail_recipients r JOIN feed.users u ON u.id = r.user_id WHERE r.mod_mail_id = $1", [m.id])).rows : [];
    if (!m || !(u.is_moderator || rec.some((x) => Number(x.id) === Number(user.id)))) return bad("Can't find that mod mail");
    const msg = (await c.query("INSERT INTO feed.mod_mail_messages (mod_mail_id, message, user_id) VALUES ($1, $2, $3) RETURNING id", [m.id, message, user.id])).rows[0];
    await c.query("UPDATE feed.mod_mails SET updated_at = now() WHERE id = $1", [m.id]);
    const from = (await c.query("SELECT username FROM feed.users WHERE id = $1", [user.id])).rows[0].username;
    for (const x of rec) {
      if (Number(x.id) === Number(user.id)) continue;
      await c.query("INSERT INTO feed.notifications (user_id, notifiable_type, notifiable_id, token) VALUES ($1, 'ModMailMessage', $2, $3) ON CONFLICT DO NOTHING", [x.id, msg.id, token()]);
      if (x.email) mails.push({ to: x.email, subject: `[${SITE_NAME}] Mod Mail Message from ${from}: ${m.subject}`, body: `${message}\n\nReply at ${feedOrigin()}/mod_mails/${sid}\n` });
    }
    return { ok: true };
  });
  if (r.ok) for (const x of mails) await feedMail(x.to, x.subject, x.body); // after the commit: a slow mail server never holds the thread open
  return r;
}
