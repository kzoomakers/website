import { conn } from "@/lib/db";
import type { TagRow } from "./stories";

export type Profile = {
  id: number; username: string; created_at: Date | null; is_admin: boolean; is_moderator: boolean; karma: number; about: string | null; banned_at: Date | null; banned_reason: string | null; banned_by: string | null;
  deleted_at: Date | null; disabled_invite_at: Date | null; invited_by: string | null; stories_submitted: number; stories_deleted: number; comments_posted: number; common_tag: Pick<TagRow, "tag" | "description" | "is_media"> | null;
  hats: { hat: string; link: string | null; created_at: Date; doffed_at: Date | null }[];
};

// Never selects email, password or settings: a profile page shows only what Lobsters shows every visitor (and none of the linked Mastodon/GitHub/homepage fields we dropped).
export async function findProfile(username: string): Promise<Profile | null> {
  const c = await conn();
  const u = (await c.query(
    `SELECT u.id, u.username, u.created_at, u.is_admin, u.is_moderator, u.karma, u.about, u.banned_at, u.banned_reason, bu.username AS banned_by, u.deleted_at, u.disabled_invite_at, iu.username AS invited_by
     FROM feed.users u LEFT JOIN feed.users bu ON bu.id = u.banned_by_user_id LEFT JOIN feed.users iu ON iu.id = u.invited_by_user_id WHERE lower(u.username) = lower($1)`, [username])).rows[0];
  if (!u) return null;
  const [k, tag, hats] = await Promise.all([
    c.query("SELECT key, value FROM feed.keystores WHERE key = ANY($1::text[])", [[`user:${u.id}:stories_submitted`, `user:${u.id}:stories_deleted`, `user:${u.id}:comments_posted`]]),
    c.query(`SELECT t.tag, t.description, t.is_media FROM feed.tags t JOIN feed.taggings tg ON tg.tag_id = t.id JOIN feed.stories s ON s.id = tg.story_id
             WHERE t.active AND s.user_id = $1 AND NOT s.is_deleted GROUP BY t.id ORDER BY count(*) DESC, t.id LIMIT 1`, [u.id]),
    c.query("SELECT hat, link, created_at, doffed_at FROM feed.hats WHERE user_id = $1 ORDER BY id", [u.id]),
  ]);
  const kv = (name: string) => Number(k.rows.find((r) => r.key === `user:${u.id}:${name}`)?.value ?? 0);
  return { ...u, stories_submitted: kv("stories_submitted"), stories_deleted: kv("stories_deleted"), comments_posted: kv("comments_posted"), common_tag: tag.rows[0] ?? null, hats: hats.rows };
}
