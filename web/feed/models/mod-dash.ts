import { conn } from "@/lib/db";
import { timeInterval } from "../interval";
import { moderationsSince, type ModRow } from "./moderations";
import type { ListedComment } from "./comments";

/** SQL for "created in the last <period>" with the interval as two parameters (n, unit), both from the validated timeInterval. */
export const sinceSql = (col: string, n: number) => `${col} >= now() - ($${n}::int * ('1 ' || $${n + 1})::interval)`;
export const sinceArgs = (period: string) => { const i = timeInterval(period); return [i.n, i.unit]; };

export type Activity =
  | { kind: "moderation"; at: Date; m: ModRow }
  | { kind: "note"; at: Date; user: string; moderator: string | null; html: string }
  | { kind: "mail"; at: Date; short_id: string; subject: string; messages: number; recipients: string[] };

/** mod/activities#index: the last 3 months of public log entries, notes and mod mails, newest first. Lobsters reads a mod_activities table; this reads the three source tables. shortcut: 500 rows of each kind. */
export async function modActivity(): Promise<Activity[]> {
  const c = await conn(), since = new Date(Date.now() - 91 * 864e5);
  const [mods, notes, mails] = await Promise.all([
    moderationsSince(since),
    c.query(`SELECT n.created_at, u.username AS "user", CASE WHEN m.username = 'inactive-user' THEN NULL ELSE m.username END AS moderator, n.markeddown_note AS html
      FROM feed.mod_notes n JOIN feed.users u ON u.id = n.user_id JOIN feed.users m ON m.id = n.moderator_user_id WHERE n.created_at >= $1 ORDER BY n.created_at DESC, n.id DESC LIMIT 500`, [since]),
    c.query(`SELECT mm.created_at, mm.short_id, mm.subject, (SELECT count(*)::int FROM feed.mod_mail_messages x WHERE x.mod_mail_id = mm.id) AS messages,
      COALESCE((SELECT array_agg(u.username ORDER BY r.id) FROM feed.mod_mail_recipients r JOIN feed.users u ON u.id = r.user_id WHERE r.mod_mail_id = mm.id), '{}') AS recipients
      FROM feed.mod_mails mm WHERE mm.created_at >= $1 ORDER BY mm.created_at DESC, mm.id DESC LIMIT 500`, [since]),
  ]);
  return [
    ...mods.map((m): Activity => ({ kind: "moderation", at: m.created_at, m })),
    ...notes.rows.map((n): Activity => ({ kind: "note", at: n.created_at, user: n.user, moderator: n.moderator, html: n.html })),
    ...mails.rows.map((m): Activity => ({ kind: "mail", at: m.created_at, short_id: m.short_id, subject: m.subject, messages: m.messages, recipients: m.recipients })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const FLAGGED_PER_PAGE = 25;

/** Comment.mod_flagged within a period: two or more flags, and more than two flag votes that are not moderator ones (reason 'M'). Newest first, 25 a page. */
export async function flaggedComments(period: string, page: number): Promise<{ comments: ListedComment[]; more: boolean }> {
  const r = await (await conn()).query(
    `SELECT c.id, c.short_id, c.story_id, c.parent_comment_id, c.depth, c.comment, c.markeddown_comment, c.score, c.flags, c.created_at, c.last_edited_at, c.is_deleted, c.is_moderated, c.is_from_email,
      u.username, u.id AS user_id, u.created_at AS user_created_at, u.deleted_at AS user_deleted_at, u.banned_at AS user_banned_at, h.hat, h.link AS hat_link, h.created_at AS hat_created_at, m.reason AS mod_reason, mu.username AS moderator,
      s.title AS story_title, s.short_id AS story_short_id, s.user_id AS story_user_id, s.user_is_author AS story_user_is_author, ps.parent_short_id
     FROM feed.comments c JOIN feed.users u ON u.id = c.user_id JOIN feed.stories s ON s.id = c.story_id LEFT JOIN feed.hats h ON h.id = c.hat_id
     LEFT JOIN LATERAL (SELECT reason, moderator_user_id FROM feed.moderations WHERE comment_id = c.id ORDER BY id DESC LIMIT 1) m ON true LEFT JOIN feed.users mu ON mu.id = m.moderator_user_id
     LEFT JOIN LATERAL (SELECT pc.short_id AS parent_short_id FROM feed.comments pc WHERE pc.id = c.parent_comment_id) ps ON true
     WHERE c.flags >= 2 AND (SELECT count(*) FROM feed.votes v WHERE v.comment_id = c.id AND v.vote < 0 AND v.reason <> 'M') > 2 AND ${sinceSql("c.created_at", 3)}
     ORDER BY c.id DESC LIMIT $1 OFFSET $2`, [FLAGGED_PER_PAGE + 1, (page - 1) * FLAGGED_PER_PAGE, ...sinceArgs(period)]);
  return { comments: r.rows.slice(0, FLAGGED_PER_PAGE), more: r.rows.length > FLAGGED_PER_PAGE };
}

export type Commenter = { username: string; sigma: number; average_flags: number; n_flags: number; n_comments: number; percent_flagged: number };
export type Aggregates = { stddev: number; avg: number; n_comments: number; n_commenters: number };

/** FlaggedCommenters: the consistently most-flagged commenters (flags spread over several comments and stories), as standard deviations above the average commenter. No cache. */
export async function flaggedCommenters(period: string): Promise<{ agg: Aggregates; commenters: Commenter[] }> {
  const c = await conn(), args = sinceArgs(period);
  const a = (await c.query(
    `SELECT COALESCE(stddev(sum_flags), 0)::float AS stddev, COALESCE(avg(sum_flags), 0)::float AS avg, COALESCE(avg(n_comments), 0)::float AS n_comments, count(*)::int AS n_commenters
     FROM (SELECT sum(c.flags) AS sum_flags, count(*) AS n_comments FROM feed.comments c JOIN feed.users u ON u.id = c.user_id
       WHERE ${sinceSql("c.created_at", 1)} AND u.banned_at IS NULL AND u.deleted_at IS NULL GROUP BY c.user_id) sums`, args)).rows[0];
  // stddev is 0 with one commenter: skip the ranking rather than divide by it
  const commenters = a.stddev > 0 ? (await c.query(
    `SELECT * FROM (SELECT u.username, (sum(c.flags) - $3::float) / $4::float AS sigma,
        count(DISTINCT c.id) FILTER (WHERE c.flags > 0)::int AS n_comments, count(DISTINCT c.story_id) FILTER (WHERE c.flags > 0)::int AS n_stories,
        sum(c.flags)::int AS n_flags, sum(c.flags)::float / count(DISTINCT c.id) AS average_flags,
        count(DISTINCT c.id) FILTER (WHERE c.flags > 0) * 100.0 / count(DISTINCT c.id) AS percent_flagged
      FROM feed.comments c JOIN feed.users u ON u.id = c.user_id WHERE ${sinceSql("c.created_at", 1)} AND u.banned_at IS NULL AND u.deleted_at IS NULL GROUP BY u.id, u.username) x
     WHERE n_comments > 4 AND n_stories > 1 AND n_flags >= 10 AND percent_flagged > 10 ORDER BY sigma DESC LIMIT 30`, [...args, a.avg, a.stddev])).rows : [];
  return { agg: a, commenters };
}
