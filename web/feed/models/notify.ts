import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

/** notify_comment_job.rb + notification.rb: inbox rows for the people a new comment replies to (the parent's author, and the story's author if they follow it) and the people it @mentions. Rows exist even for people who wouldn't want to see them: those are created already read, as in Lobsters.
 *  Call inside the commenter's transaction. Email and Pushover delivery are not ported yet. */
export async function notifyComment(c: PoolClient, commentId: number): Promise<void> {
  const m = (await c.query(
    `SELECT c.id, c.user_id, c.story_id, c.comment, c.score, c.flags, c.is_deleted, c.is_moderated, c.parent_comment_id, cu.username,
       s.user_id AS story_user_id, s.user_is_following, s.score AS story_score, s.flags AS story_flags,
       p.user_id AS parent_user_id, p.score AS parent_score, p.flags AS parent_flags, (p.is_deleted OR p.is_moderated) AS parent_gone
     FROM feed.comments c JOIN feed.users cu ON cu.id = c.user_id JOIN feed.stories s ON s.id = c.story_id LEFT JOIN feed.comments p ON p.id = c.parent_comment_id WHERE c.id = $1`, [commentId])).rows[0];
  if (!m) return;
  const hiding = new Set((await c.query("SELECT user_id FROM feed.hidden_stories WHERE story_id = $1", [m.story_id])).rows.map((r) => Number(r.user_id)));
  const mentions = [...new Set([...String(m.comment).matchAll(/\B[@~]([\w-]+)/g)].map((x) => x[1].toLowerCase()))].filter((n) => n !== String(m.username).toLowerCase());
  const mentioned = mentions.length ? (await c.query("SELECT id FROM feed.users WHERE lower(username) = ANY($1::text[]) AND banned_at IS NULL AND deleted_at IS NULL", [mentions])).rows.map((r) => Number(r.id)) : [];

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
      `SELECT COALESCE((settings->>'inbox_mentions')::boolean, true) AS inbox_mentions,
         EXISTS (SELECT 1 FROM feed.votes v JOIN feed.comments mine ON mine.id = v.comment_id WHERE v.user_id = $1 AND v.vote = -1 AND v.story_id = $2 AND mine.user_id = $3 AND mine.story_id = $2) AS flagged_replier,
         EXISTS (SELECT 1 FROM feed.tag_filters f JOIN feed.taggings tg ON tg.tag_id = f.tag_id WHERE f.user_id = $1 AND tg.story_id = $2) AS filtered
       FROM feed.users WHERE id = $1`, [id, m.story_id, m.user_id])).rows[0];
    const display = goodPost && !u.flagged_replier && !u.filtered && (!isMention || u.inbox_mentions);
    await c.query(
      "INSERT INTO feed.notifications (user_id, notifiable_type, notifiable_id, read_at, token) VALUES ($1, 'Comment', $2, CASE WHEN $3 THEN NULL ELSE now() END, $4) ON CONFLICT (user_id, notifiable_type, notifiable_id) DO NOTHING",
      [id, m.id, display, `notification_${randomBytes(16).toString("hex")}`]);
  }
}
