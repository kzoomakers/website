import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { checkPassword } from "../auth";
import { lockCommentStory, recalcComment } from "./comment-cache";
import { systemUser } from "./mod-notes";
import { live, tx } from "./submit";

// settings#deactivate and user.rb delete! / good_riddance?. External accounts only: members and admins sign in through the main site, so their accounts end there.
export type Deactivated = { ok: true; disowned: boolean } | { ok: false; error: string };
const bad = (error: string) => ({ ok: false as const, error });

/** user.rb refresh_counts!: the profile's four counters, recounted. */
export async function refreshCounts(c: PoolClient, userId: number) {
  const n = (await c.query(
    `SELECT (SELECT count(*) FROM feed.stories WHERE user_id = $1) AS stories_submitted, (SELECT count(*) FROM feed.stories WHERE user_id = $1 AND is_deleted) AS stories_deleted,
       (SELECT count(*) FROM feed.comments WHERE user_id = $1 AND NOT is_deleted AND NOT is_moderated) AS comments_posted, (SELECT count(*) FROM feed.comments WHERE user_id = $1 AND is_deleted) AS comments_deleted`, [userId])).rows[0];
  for (const k of Object.keys(n)) await c.query("INSERT INTO feed.keystores (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [`user:${userId}:${k}`, Number(n[k])]);
}

export const deactivate = (userId: number, i: { password: string; sure: boolean; disown: boolean }): Promise<Deactivated> => tx(async (c) => {
  const me = await live(c, userId);
  if (!me || me.banned_at || me.deleted_at) return bad("not permitted");
  const u = (await c.query("SELECT username, kind, password_digest, karma FROM feed.users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
  if (u.kind !== "external") return bad("Your account is managed on the main site");
  if (!i.sure) return bad('You did not check the "I am sure" checkbox');
  if (!u.password_digest || !(await checkPassword(i.password, u.password_digest))) return bad("Given password doesn't match account");

  // negative-score comments are deleted, in story-then-comment lock order like every other comment writer
  for (const r of (await c.query("SELECT short_id FROM feed.comments WHERE user_id = $1 AND score < 0 AND NOT is_deleted ORDER BY id", [userId])).rows) {
    await lockCommentStory(c, r.short_id);
    const row = (await c.query("UPDATE feed.comments SET is_deleted = true, updated_at = now() WHERE short_id = $1 RETURNING id", [r.short_id])).rows[0];
    await recalcComment(c, row.id);
  }
  // private messages go from this side; one both sides have deleted is removed
  await c.query("UPDATE feed.messages SET deleted_by_author = true WHERE author_user_id = $1", [userId]);
  await c.query("UPDATE feed.messages SET deleted_by_recipient = true WHERE recipient_user_id = $1", [userId]);
  const both = "deleted_by_author AND deleted_by_recipient AND (author_user_id = $1 OR recipient_user_id = $1)";
  await c.query(`DELETE FROM feed.notifications WHERE notifiable_type = 'Message' AND notifiable_id IN (SELECT id FROM feed.messages WHERE ${both})`, [userId]);
  await c.query(`DELETE FROM feed.messages WHERE ${both}`, [userId]);
  await c.query("UPDATE feed.invitations SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await c.query("UPDATE feed.hats SET doffed_at = now(), updated_at = now() WHERE user_id = $1 AND modlog_use AND doffed_at IS NULL", [userId]);

  if (i.disown) { // inactive_user.rb disown_all_by_author!: deleted things keep their author, which mods want when someone returns
    const sys = await systemUser(c);
    await c.query("UPDATE feed.stories SET user_id = $2 WHERE user_id = $1 AND NOT is_deleted", [userId, sys]);
    await c.query("UPDATE feed.comments SET user_id = $2 WHERE user_id = $1 AND NOT is_deleted AND NOT is_moderated", [userId, sys]);
    await refreshCounts(c, sys);
  }
  await refreshCounts(c, userId);

  // good_riddance?: someone who left badly has to talk to a mod, so their address is replaced
  const recent = (await c.query(
    `SELECT (SELECT count(*) FROM feed.comments WHERE user_id = $1 AND is_deleted AND created_at > now() - interval '30 days')
          + (SELECT count(*) FROM feed.stories WHERE user_id = $1 AND is_deleted AND is_moderated AND created_at > now() - interval '30 days') AS n`, [userId])).rows[0].n;
  const rotate = u.karma < 0 || Number(recent) > 3;
  await c.query("UPDATE feed.users SET deleted_at = now(), session_version = session_version + 1, email = CASE WHEN $2 THEN $3 ELSE email END WHERE id = $1", [userId, rotate, `${u.username}@talk.invalid`]);
  await c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, action, token) VALUES (NULL, $1, $2, $3)", [userId, `deactivated${i.disown ? ", disowning their stories and comments" : ""}`, `moderation_${randomBytes(16).toString("hex")}`]);
  return { ok: true, disowned: i.disown };
});
