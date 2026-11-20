import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { updateCachedColumns } from "./cached";
import { recalcComment } from "./comment-cache";
import { live, tx } from "./submit";

// Moderator delete and undelete of stories and comments (stories#destroy/#undelete for moderators, mod/comments_controller, comment.rb delete_by_moderator, story.rb log_moderation).
// Every change writes a feed.moderations row, which is the public /moderations log. Moderators are users.is_moderator.

export type ModResult = { ok: true } | { ok: false; error: string };
const REASON_MAX = 4000;

const log = (c: PoolClient, mod: number, target: { story_id?: number; comment_id?: number }, action: string, reason: string) =>
  c.query("INSERT INTO feed.moderations (moderator_user_id, story_id, comment_id, action, reason, token) VALUES ($1, $2, $3, $4, $5, $6)",
    [mod, target.story_id ?? null, target.comment_id ?? null, action, reason.trim() || null, `moderation_${randomBytes(16).toString("hex")}`]);

const mod = async (c: PoolClient, id: number) => { const u = await live(c, id); return u && u.is_moderator && !u.banned_at && !u.deleted_at ? u : null; };

/** Delete or undelete any story. Deleting marks it moderated, so its author can't edit or undelete it; undeleting clears that. Acting on your own story is the ordinary author path and is not logged. */
export const modSetStoryDeleted = (moderator: { id: number }, shortId: string, deleted: boolean, reason = ""): Promise<ModResult> => tx(async (c) => {
  if (!(await mod(c, moderator.id))) return { ok: false, error: "not permitted" };
  const s = (await c.query("SELECT id, user_id, is_deleted FROM feed.stories WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  if (!s) return { ok: false, error: "Can't find story" };
  if (s.is_deleted === deleted) return { ok: true };
  await c.query("UPDATE feed.stories SET is_deleted = $2, is_moderated = $3, updated_at = now() WHERE id = $1", [s.id, deleted, deleted || s.user_id === moderator.id]);
  await c.query("INSERT INTO feed.keystores (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = COALESCE(feed.keystores.value, 0) + $2", [`user:${s.user_id}:stories_deleted`, deleted ? 1 : -1]);
  if (s.user_id !== moderator.id) await log(c, moderator.id, { story_id: s.id }, deleted ? "deleted story" : "undeleted story", reason.slice(0, REASON_MAX));
  await updateCachedColumns(c, s.id);
  return { ok: true };
});

/** Delete or undelete any comment. Deleting costs its author 2 karma per vote it got (each upvote earned 1), as delete_by_moderator does, and undeleting does not give it back (as in Lobsters). */
export const modSetCommentDeleted = (moderator: { id: number }, shortId: string, deleted: boolean, reason = ""): Promise<ModResult> => tx(async (c) => {
  if (!(await mod(c, moderator.id))) return { ok: false, error: "not permitted" };
  const m = (await c.query("SELECT id, user_id, is_deleted, is_moderated FROM feed.comments WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  if (!m) return { ok: false, error: "Can't find comment" };
  if (deleted) {
    if (m.is_moderated) return { ok: true };
    await c.query("UPDATE feed.comments SET is_deleted = true, is_moderated = true, updated_at = now() WHERE id = $1", [m.id]);
    await log(c, moderator.id, { comment_id: m.id }, "deleted comment", reason.slice(0, REASON_MAX));
    const votes = (await c.query("SELECT count(*)::int n FROM feed.votes WHERE comment_id = $1", [m.id])).rows[0].n;
    await c.query("UPDATE feed.users SET karma = karma - $2 WHERE id = $1", [m.user_id, votes * 2]);
  } else {
    if (!m.is_deleted && !m.is_moderated) return { ok: true };
    await c.query("UPDATE feed.comments SET is_deleted = false, is_moderated = false, updated_at = now() WHERE id = $1", [m.id]);
    if (m.user_id !== moderator.id) await log(c, moderator.id, { comment_id: m.id }, "undeleted comment", "");
  }
  await recalcComment(c, m.id);
  return { ok: true };
});
