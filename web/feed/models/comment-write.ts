import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { COMMENTABLE_DAYS, MAX_DEPTH, commentProblems, isDeletable, isEditable, speedDelayMins } from "../comment-rules";
import { recalcComment } from "./comment-cache";
import { notifyComment } from "./notify";
import { renderPost } from "./render";
import { live, tx } from "./submit";

// Writing comments (comments_controller + comment.rb callbacks), one transaction each.

export type CommentResult = { ok: true; shortId: string; storyShortId: string } | { ok: false; errors: string[] };
const fail = (errors: string[]): CommentResult => ({ ok: false, errors });
const SHORT = "abcdefghijklmnopqrstuvwxyz0123456789";
const newShort = () => Array.from(randomBytes(6), (b) => SHORT[b % 36]).join("");
const banned = (u: { banned_at: unknown; deleted_at: unknown } | undefined) => !u || !!u.banned_at || !!u.deleted_at;

/** comment.rb breaks_speed_limit?: in heated threads (flags on the reply chain), wait longer between your own comments in the same thread. Returns minutes still to wait, or 0. */
async function speedWait(c: PoolClient, userId: number, parent: { id: number; thread_id: number }): Promise<number> {
  const chain = (await c.query(
    `WITH RECURSIVE p AS (SELECT id, parent_comment_id FROM feed.comments WHERE id = $1 UNION ALL SELECT c.id, c.parent_comment_id FROM feed.comments c JOIN p ON c.id = p.parent_comment_id) SELECT id FROM p`, [parent.id])).rows.map((r) => r.id);
  const f = (await c.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE user_id = $2)::int AS mine FROM feed.votes WHERE vote = -1 AND comment_id = ANY($1::bigint[])", [chain, userId])).rows[0];
  const delay = speedDelayMins(f.n, f.mine);
  const recent = (await c.query("SELECT created_at FROM feed.comments WHERE user_id = $1 AND thread_id = $2 AND created_at >= now() - ($3::int * interval '1 minute') ORDER BY created_at DESC LIMIT 1", [userId, parent.thread_id, delay])).rows[0];
  return recent ? Math.max(1, Math.ceil((new Date(recent.created_at).getTime() + delay * 60_000 - Date.now()) / 60_000)) : 0;
}

/** comments#create. Resubmitting the exact same comment (slow connections) quietly returns the existing one. */
export const createComment = (user: { id: number }, o: { storyShortId: string; parentShortId?: string; comment: string }): Promise<CommentResult> => tx(async (c) => {
  const u = await live(c, user.id);
  if (banned(u)) return fail(["You can't comment."]);
  const s = (await c.query("SELECT s.id, s.short_id, s.created_at, (s.is_deleted OR (b.banned_at IS NOT NULL AND s.score < 0 AND NOT s.is_moderated)) AS gone FROM feed.stories s JOIN feed.users b ON b.id = s.user_id WHERE s.short_id = $1 FOR UPDATE OF s", [o.storyShortId])).rows[0];
  if (!s || s.gone) return fail(["Can't find story."]);
  let parent: { id: number; thread_id: number; depth: number; is_deleted: boolean; is_moderated: boolean } | undefined;
  if (o.parentShortId) {
    parent = (await c.query("SELECT id, thread_id, depth, is_deleted, is_moderated FROM feed.comments WHERE story_id = $1 AND short_id = $2 FOR UPDATE", [s.id, o.parentShortId])).rows[0];
    if (!parent) return fail(["Invalid parent comment."]);
  }
  const text = o.comment.replace(/\s+$/, "");
  const again = (await c.query("SELECT short_id FROM feed.comments WHERE user_id = $1 AND story_id = $2 AND parent_comment_id IS NOT DISTINCT FROM $3 AND comment = $4 LIMIT 1", [user.id, s.id, parent?.id ?? null, text])).rows[0];
  if (again) return { ok: true, shortId: again.short_id, storyShortId: s.short_id };

  const errors = commentProblems(o.comment);
  if (parent && (parent.is_deleted || parent.is_moderated)) errors.push("Comment was deleted by the author or a mod while you were writing.");
  if (parent && parent.depth >= MAX_DEPTH) errors.push("You have replied too greedily and too deep.");
  if (new Date(s.created_at).getTime() < Date.now() - COMMENTABLE_DAYS * 864e5) errors.push("Story is no longer accepting comments.");
  if (parent && (await c.query("SELECT 1 FROM feed.votes WHERE user_id = $1 AND comment_id = $2 AND vote = -1", [user.id, parent.id])).rowCount) errors.push("You've flagged that comment for the mods, so you can leave it for the mods.");
  if (errors.length) return fail(errors);
  if (parent && !u.is_moderator) { const w = await speedWait(c, user.id, parent); if (w) return fail([`Thread speed limit reached, next comment allowed in about ${w} minute${w === 1 ? "" : "s"}.`]); }

  const thread = parent?.thread_id ?? (await c.query("INSERT INTO feed.keystores (key, value) VALUES ('thread_id', 1) ON CONFLICT (key) DO UPDATE SET value = COALESCE(feed.keystores.value, 0) + 1 RETURNING value", [])).rows[0].value;
  const html = await renderPost(c, text);
  // The unique index on short_id settles races: a taken id inserts nothing and we draw another.
  let sid = "", r: { id: number } | undefined;
  for (let i = 0; !r; i++) {
    if (i === 10) throw new Error("too many short id collisions");
    sid = newShort();
    r = (await c.query(
      `INSERT INTO feed.comments (short_id, story_id, user_id, parent_comment_id, thread_id, comment, markeddown_comment, depth, last_edited_at, token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9) ON CONFLICT (short_id) DO NOTHING RETURNING id`,
      [sid, s.id, user.id, parent?.id ?? null, thread, text, html, parent ? parent.depth + 1 : 0, `comment_${randomBytes(16).toString("hex")}`])).rows[0];
  }
  await c.query("INSERT INTO feed.votes (user_id, story_id, comment_id, vote) VALUES ($1, $2, $3, 1)", [user.id, s.id, r.id]); // own upvote: no karma
  if (parent) await c.query("UPDATE feed.comments SET reply_count = reply_count + 1, last_reply_at = now(), updated_at = now() WHERE id = $1", [parent.id]);
  await c.query("UPDATE feed.stories SET last_comment_at = now(), updated_at = now() WHERE id = $1", [s.id]);
  await c.query("INSERT INTO feed.keystores (key, value) VALUES ($1, 1) ON CONFLICT (key) DO UPDATE SET value = COALESCE(feed.keystores.value, 0) + 1", [`user:${user.id}:comments_posted`]);
  await recalcComment(c, r.id);
  await notifyComment(c, r.id);
  return { ok: true, shortId: sid, storyShortId: s.short_id } as CommentResult;
});

const own = async (c: PoolClient, shortId: string) => (await c.query("SELECT c.*, s.short_id AS story_short_id FROM feed.comments c JOIN feed.stories s ON s.id = c.story_id WHERE c.short_id = $1 FOR UPDATE OF c", [shortId])).rows[0];

/** comments#update: edit within 6 hours of the last edit. */
export const updateComment = (user: { id: number }, shortId: string, comment: string): Promise<CommentResult> => tx(async (c) => {
  const u = await live(c, user.id), row = await own(c, shortId);
  if (banned(u) || !row || !isEditable(row, user.id)) return fail(["You cannot edit that comment."]);
  const errors = commentProblems(comment);
  if (errors.length) return fail(errors);
  const text = comment.replace(/\s+$/, "");
  await c.query("UPDATE feed.comments SET comment = $2, markeddown_comment = $3, last_edited_at = now(), updated_at = now() WHERE id = $1", [row.id, text, await renderPost(c, text)]);
  if (row.parent_comment_id) await c.query("UPDATE feed.comments SET last_reply_at = now(), updated_at = now() WHERE id = $1", [row.parent_comment_id]);
  return { ok: true, shortId, storyShortId: row.story_short_id } as CommentResult;
});

/** comments#destroy and #undelete by the author (moderator removal arrives with the mod tools). Confidence is recalculated so deleted comments sort last and come back in place. */
export const setCommentDeleted = (user: { id: number }, shortId: string, deleted: boolean): Promise<CommentResult> => tx(async (c) => {
  const u = await live(c, user.id), row = await own(c, shortId);
  if (banned(u) || !row || row.user_id !== user.id || row.is_moderated || (deleted && !isDeletable(row, user.id))) return fail(["Can't find comment."]);
  await c.query("UPDATE feed.comments SET is_deleted = $2, updated_at = now() WHERE id = $1", [row.id, deleted]);
  await recalcComment(c, row.id);
  return { ok: true, shortId, storyShortId: row.story_short_id } as CommentResult;
});
