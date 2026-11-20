import { conn } from "@/lib/db";
import type { Comment } from "./story-page";

export const COMMENTS_PER_PAGE = 20;

const SELECT = `SELECT c.id, c.short_id, c.story_id, c.parent_comment_id, c.depth, c.comment, c.markeddown_comment, c.score, c.flags, c.created_at, c.last_edited_at, c.is_deleted, c.is_moderated, c.is_from_email,
  u.username, u.id AS user_id, u.created_at AS user_created_at, u.deleted_at AS user_deleted_at, u.banned_at AS user_banned_at, h.hat, h.link AS hat_link, h.created_at AS hat_created_at, m.reason AS mod_reason, mu.username AS moderator,
  s.title AS story_title, s.short_id AS story_short_id, s.user_id AS story_user_id, s.user_is_author AS story_user_is_author, ps.parent_short_id
  FROM feed.comments c JOIN feed.users u ON u.id = c.user_id JOIN feed.stories s ON s.id = c.story_id LEFT JOIN feed.hats h ON h.id = c.hat_id
  LEFT JOIN LATERAL (SELECT reason, moderator_user_id FROM feed.moderations WHERE comment_id = c.id ORDER BY id DESC LIMIT 1) m ON true LEFT JOIN feed.users mu ON mu.id = m.moderator_user_id
  LEFT JOIN LATERAL (SELECT pc.short_id AS parent_short_id FROM feed.comments pc WHERE pc.id = c.parent_comment_id) ps ON true`;

export type ListedComment = Comment & { parent_short_id: string | null };

/** /comments: the newest comments a visitor may see (comments.active, on stories that are not deleted). */
export async function newestComments(page = 1): Promise<{ comments: ListedComment[]; more: boolean }> {
  const r = await (await conn()).query(`${SELECT} WHERE NOT c.is_deleted AND NOT c.is_moderated AND NOT s.is_deleted ORDER BY c.id DESC LIMIT $1 OFFSET $2`, [COMMENTS_PER_PAGE + 1, (page - 1) * COMMENTS_PER_PAGE]);
  return { comments: r.rows.slice(0, COMMENTS_PER_PAGE), more: r.rows.length > COMMENTS_PER_PAGE };
}

/** /upvoted/comments: comments the viewer upvoted, newest vote target first, not their own and not on deleted stories. */
export async function upvotedComments(userId: number, page = 1): Promise<{ comments: ListedComment[]; more: boolean }> {
  const r = await (await conn()).query(`${SELECT} WHERE c.user_id <> $3 AND NOT c.is_deleted AND NOT c.is_moderated AND NOT s.is_deleted
    AND EXISTS (SELECT 1 FROM feed.votes v WHERE v.comment_id = c.id AND v.user_id = $3 AND v.vote = 1) ORDER BY c.id DESC LIMIT $1 OFFSET $2`, [COMMENTS_PER_PAGE + 1, (page - 1) * COMMENTS_PER_PAGE, userId]);
  return { comments: r.rows.slice(0, COMMENTS_PER_PAGE), more: r.rows.length > COMMENTS_PER_PAGE };
}

/** ~user/comments.rss: what the user wrote on stories that are not deleted (gone comments show their removal text), oldest first as Lobsters lists it.
 *  shortcut: Lobsters has no limit; this takes the newest 500 so one prolific user cannot make a huge response. Raise it if feeds look cut short. */
export async function commentsByUser(userId: number, limit = 500): Promise<ListedComment[]> {
  return (await (await conn()).query(`SELECT * FROM (${SELECT} WHERE c.user_id = $1 AND NOT s.is_deleted ORDER BY c.id DESC LIMIT $2) x ORDER BY x.id`, [userId, limit])).rows;
}

/** Comment by short id for /c/:id.json (any comment, as Lobsters does). */
export async function findComment(shortId: string): Promise<(ListedComment & { story_token: string }) | null> {
  const r = await (await conn()).query(`${SELECT.replace("s.title AS story_title", "s.token AS story_token, s.title AS story_title")} WHERE c.short_id = $1`, [shortId]);
  return r.rows[0] ?? null;
}

export const INBOX_PER_PAGE = 25;
export type InboxComment = ListedComment & { notification_id: number; read_at: Date | null };

/** inbox_controller#all and #unread: the viewer's comment notifications, newest first. Listing them marks them read (as Lobsters does). */
export async function inboxFor(userId: number, unreadOnly: boolean, page = 1): Promise<{ comments: InboxComment[]; more: boolean }> {
  const c = await conn();
  const r = await c.query(
    `SELECT x.* FROM (SELECT n.id AS notification_id, n.read_at, n.created_at AS notified_at, q.* FROM feed.notifications n JOIN LATERAL (${SELECT} WHERE c.id = n.notifiable_id) q ON true
       WHERE n.user_id = $1 AND n.notifiable_type = 'Comment' ${unreadOnly ? "AND n.read_at IS NULL" : ""}) x ORDER BY x.notified_at DESC, x.notification_id DESC LIMIT $2 OFFSET $3`,
    [userId, INBOX_PER_PAGE + 1, unreadOnly ? 0 : (page - 1) * INBOX_PER_PAGE]);
  const rows: InboxComment[] = r.rows.slice(0, INBOX_PER_PAGE);
  const unread = rows.filter((x) => !x.read_at).map((x) => x.notification_id);
  if (unread.length) await c.query("UPDATE feed.notifications SET read_at = now(), updated_at = now() WHERE id = ANY($1::bigint[]) AND user_id = $2", [unread, userId]);
  return { comments: rows, more: r.rows.length > INBOX_PER_PAGE };
}
