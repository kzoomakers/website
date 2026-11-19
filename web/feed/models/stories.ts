import { conn } from "@/lib/db";

export const STORIES_PER_PAGE = 25;
export type Tag = { tag: string; description: string | null; is_media: boolean };
export type Story = {
  id: number; short_id: string; title: string; url: string | null; created_at: Date; score: number; flags: number; comments_count: number; stories_count: number; merged_story_id: number | null;
  description: string | null; markeddown_description: string | null; user_is_author: boolean; is_moderated: boolean;
  username: string; user_created_at: Date | null; user_deleted_at: Date | null; user_banned_at: Date | null; domain: string | null; origin: string | null; tags: Tag[];
};
export type Kind = "hottest" | "newest" | "active" | "recent";

// What a logged-out visitor may see (story.rb visible_to): not deleted, and not a negative-score story by a banned user that no moderator has reviewed.
const VISIBLE = "NOT s.is_deleted AND NOT (s.score < 0 AND NOT s.is_moderated AND u.banned_at IS NOT NULL)";
const SELECT = `SELECT s.id, s.short_id, s.title, s.url, s.created_at, s.score, s.flags, s.comments_count, s.stories_count, s.merged_story_id, s.description, s.markeddown_description, s.user_is_author, s.is_moderated,
  u.username, u.created_at AS user_created_at, u.deleted_at AS user_deleted_at, u.banned_at AS user_banned_at, d.domain, o.identifier AS origin,
  COALESCE((SELECT json_agg(json_build_object('tag', t.tag, 'description', t.description, 'is_media', t.is_media) ORDER BY tg.id) FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = s.id), '[]') AS tags
  FROM feed.stories s JOIN feed.users u ON u.id = s.user_id LEFT JOIN feed.domains d ON d.id = s.domain_id LEFT JOIN feed.origins o ON o.id = s.origin_id`;

// Ties are broken by id, as a database's undefined order would otherwise reshuffle equal stories between page loads.
const WHERE: Record<Kind, { where: string; order: string }> = {
  hottest: { where: `${VISIBLE} AND s.merged_story_id IS NULL AND s.score >= 0`, order: "s.hotness, s.id" },
  newest: { where: VISIBLE, order: "s.id DESC" },
  active: { where: `${VISIBLE} AND s.merged_story_id IS NULL`, order: "s.last_comment_at DESC NULLS LAST, s.id DESC" }, // SQLite sorted NULLs last on DESC; Postgres puts them first
  // not on the front page (the first page of hottest), under 5 points, under 10 days old
  recent: { where: `${VISIBLE} AND s.score < 5 AND s.created_at >= now() - interval '10 days'
    AND s.id NOT IN (SELECT s.id FROM feed.stories s JOIN feed.users u ON u.id = s.user_id WHERE ${VISIBLE} AND s.merged_story_id IS NULL AND s.score >= 0 ORDER BY s.hotness, s.id LIMIT ${STORIES_PER_PAGE})`, order: "s.created_at DESC, s.id DESC" },
};

/** One page of stories for a logged-out visitor, plus whether another page follows (it fetches one extra row to know). */
export async function listStories(kind: Kind, page = 1): Promise<{ stories: Story[]; more: boolean }> {
  const q = WHERE[kind];
  const r = await (await conn()).query(`${SELECT} WHERE ${q.where} ORDER BY ${q.order} LIMIT $1 OFFSET $2`, [STORIES_PER_PAGE + 1, (page - 1) * STORIES_PER_PAGE]);
  const more = r.rows.length > STORIES_PER_PAGE;
  return { stories: r.rows.slice(0, STORIES_PER_PAGE), more };
}
