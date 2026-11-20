import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { Push } from "../mail";
import { feedOrigin } from "../config";
import { SITE_NAME } from "../format";

export type Out = { mails: Mail[]; pushes: Push[] };
export type Mail = { to: string; subject: string; text: string; headers?: Record<string, string> };
const wrap = (s: string, w = 72) => s.replace(new RegExp(`(.{1,${w}})(\\s+|$)`, "g"), "$1\n").trimEnd().replace(/\n/g, "\n  ");

/** notify_comment_job.rb + notification.rb: inbox rows for the people a new comment replies to (the parent's author, and the story's author if they follow it) and the people it @mentions. Rows exist even for people who wouldn't want to see them: those are created already read, as in Lobsters.
 *  Call inside the commenter's transaction. Returns the reply/mention emails and Pushover alerts to send once the transaction commits. */
export async function notifyComment(c: PoolClient, commentId: number): Promise<Out> {
  const mails: Mail[] = [], pushes: Push[] = [], out = { mails, pushes };
  const m = (await c.query(
    `SELECT c.id, c.user_id, c.story_id, c.comment, c.score, c.flags, c.is_deleted, c.is_moderated, c.parent_comment_id, c.short_id, cu.username, s.title AS story_title, s.short_id AS story_short_id,
       s.user_id AS story_user_id, s.user_is_following, s.score AS story_score, s.flags AS story_flags,
       p.user_id AS parent_user_id, (SELECT username FROM feed.users WHERE id = p.user_id) AS parent_username, p.score AS parent_score, p.flags AS parent_flags, (p.is_deleted OR p.is_moderated) AS parent_gone
     FROM feed.comments c JOIN feed.users cu ON cu.id = c.user_id JOIN feed.stories s ON s.id = c.story_id LEFT JOIN feed.comments p ON p.id = c.parent_comment_id WHERE c.id = $1`, [commentId])).rows[0];
  if (!m) return out;
  const hiding = new Set((await c.query("SELECT user_id FROM feed.hidden_stories WHERE story_id = $1", [m.story_id])).rows.map((r) => Number(r.user_id)));
  const mentions = [...new Set([...String(m.comment).matchAll(/\B[@~]([\w-]+)/g)].map((x) => x[1].toLowerCase()))].filter((n) => n !== String(m.username).toLowerCase());
  const mentioned = mentions.length ? (await c.query("SELECT id FROM feed.users WHERE lower(username) = ANY($1::text[]) AND banned_at IS NULL AND deleted_at IS NULL", [mentions])).rows.map((r) => Number(r.id)) : [];

  // threading (EmailReplyMailer#set_headers): each comment and story has a stable Message-Id; References lists the story then the ancestors, root first
  const host = new URL(feedOrigin()).host, mid = (k: string, sid: string) => `<${k}.${sid}@${host}>`;
  const ancestors = m.parent_comment_id ? (await c.query(
    `WITH RECURSIVE a AS (SELECT id, short_id, parent_comment_id, 1 AS n FROM feed.comments WHERE id = $1 UNION ALL SELECT c.id, c.short_id, c.parent_comment_id, a.n + 1 FROM feed.comments c JOIN a ON c.id = a.parent_comment_id) SELECT short_id FROM a ORDER BY n DESC`, [m.parent_comment_id])).rows : [];
  const headers = { "Message-Id": mid("comment", m.short_id), References: [mid("story", m.story_short_id), ...ancestors.map((a) => mid("comment", a.short_id))].join(" "),
    "In-Reply-To": ancestors.length ? mid("comment", ancestors[ancestors.length - 1].short_id) : mid("story", m.story_short_id) };

  const replies = new Set<number>();
  if (m.story_user_id !== m.user_id && m.user_is_following) replies.add(Number(m.story_user_id));
  if (m.parent_user_id && m.parent_user_id !== m.user_id) replies.add(Number(m.parent_user_id));
  const live = replies.size ? new Set((await c.query("SELECT id FROM feed.users WHERE id = ANY($1::bigint[]) AND banned_at IS NULL AND deleted_at IS NULL", [[...replies]])).rows.map((r) => Number(r.id))) : new Set<number>();

  const isMention = /\B[@~][\w-]+/.test(m.comment);
  const goodPost = m.story_score > m.story_flags && !m.is_deleted && !m.is_moderated && m.score > m.flags && !(m.parent_comment_id && (m.parent_score <= m.parent_flags || m.parent_gone));
  const notified = new Set<number>(); // notify_once: replies first, so someone who is both replied to and mentioned gets one row
  for (const id of [...live, ...mentioned]) {
    if (notified.has(id) || hiding.has(id)) continue;
    notified.add(id);
    const u = (await c.query(
      `SELECT email, settings->>'pushover_user_key' AS pkey, settings->>'pushover_replies' AS pushover_replies, settings->>'pushover_mentions' AS pushover_mentions, settings->>'email_replies' AS email_replies, settings->>'email_mentions' AS email_mentions, COALESCE((settings->>'inbox_mentions')::boolean, true) AS inbox_mentions,
         EXISTS (SELECT 1 FROM feed.votes v JOIN feed.comments mine ON mine.id = v.comment_id WHERE v.user_id = $1 AND v.vote = -1 AND v.story_id = $2 AND mine.user_id = $3 AND mine.story_id = $2) AS flagged_replier,
         EXISTS (SELECT 1 FROM feed.tag_filters f JOIN feed.taggings tg ON tg.tag_id = f.tag_id WHERE f.user_id = $1 AND tg.story_id = $2) AS filtered
       FROM feed.users WHERE id = $1`, [id, m.story_id, m.user_id])).rows[0];
    const display = goodPost && !u.flagged_replier && !u.filtered && (!isMention || u.inbox_mentions);
    const fresh = await c.query(
      "INSERT INTO feed.notifications (user_id, notifiable_type, notifiable_id, read_at, token) VALUES ($1, 'Comment', $2, CASE WHEN $3 THEN NULL ELSE now() END, $4) ON CONFLICT (user_id, notifiable_type, notifiable_id) DO NOTHING",
      [id, m.id, display, `notification_${randomBytes(16).toString("hex")}`]);
    if (!fresh.rowCount) continue;
    const reply = live.has(id), link = `${feedOrigin()}/c/${m.short_id}`, quoted = wrap(String(m.comment));
    if (u.email && (reply ? u.email_replies : u.email_mentions) === "true") {
      const to = !m.parent_comment_id ? "your story" : m.parent_user_id === id ? "you" : m.parent_username;
      mails.push(reply
        ? { to: u.email, subject: `[${SITE_NAME}] Reply from ${m.username} on ${m.story_title}`, text: `${m.username} has replied to ${to}:\n\n  ${quoted}\n\nContinue at ${link}\n`, headers }
        : { to: u.email, subject: `[${SITE_NAME}] Mention from ${m.username} on ${m.story_title}`, text: `${m.username} mentioned you in a comment:\n\n  ${quoted}\n\nVisit ${link}\n`, headers });
    }
    if (u.pkey && (reply ? u.pushover_replies : u.pushover_mentions) === "true")
      pushes.push({ key: u.pkey, title: `${SITE_NAME} ${reply ? "reply from" : "mention by"} ${m.username} on ${m.story_title}`, message: String(m.comment), click: link });
  }
  return out;
}
