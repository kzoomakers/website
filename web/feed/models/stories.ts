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

export type Query = { where: string; order: string; params?: unknown[] }; // `where` may use $3, $4... for params (1 and 2 are limit and offset)

/** One page of stories for a logged-out visitor, plus whether another page follows (it fetches one extra row to know). */
export async function listBy(q: Query, page = 1): Promise<{ stories: Story[]; more: boolean }> {
  const r = await (await conn()).query(`${SELECT} WHERE ${q.where} ORDER BY ${q.order} LIMIT $1 OFFSET $2`, [STORIES_PER_PAGE + 1, (page - 1) * STORIES_PER_PAGE, ...(q.params ?? [])]);
  return { stories: r.rows.slice(0, STORIES_PER_PAGE), more: r.rows.length > STORIES_PER_PAGE };
}
export const listStories = (kind: Kind, page = 1) => listBy(WHERE[kind], page);
export const kindQuery = (kind: Kind): Query => WHERE[kind];

const UNMERGED = `${VISIBLE} AND s.merged_story_id IS NULL`;
const tagged = (col: string) => `EXISTS (SELECT 1 FROM feed.taggings tg WHERE tg.story_id = s.id AND ${col})`;
// The queries behind the other lists; each is the matching scope in story.rb.
export const byTags = (tagIds: number[]): Query => ({ where: `${UNMERGED} AND s.score >= 0 AND ${tagged("tg.tag_id = ANY($3::bigint[])")}`, order: "s.created_at DESC, s.id DESC", params: [tagIds] });
export const byCategories = (ids: number[]): Query => ({ where: `${UNMERGED} AND s.score >= 0 AND ${tagged("tg.tag_id IN (SELECT id FROM feed.tags WHERE category_id = ANY($3::bigint[]))")}`, order: "s.created_at DESC, s.id DESC", params: [ids] });
export const byDomain = (id: number): Query => ({ where: `${UNMERGED} AND s.domain_id = $3`, order: "s.id DESC", params: [id] });
export const byOrigin = (id: number): Query => ({ where: `${UNMERGED} AND s.origin_id = $3`, order: "s.id DESC", params: [id] });
export const byUser = (id: number): Query => ({ where: `${VISIBLE} AND s.user_id = $3`, order: "s.id DESC", params: [id] }); // includes merged stories, as newest_by_user does
/** `unit` must come from interval.ts (a fixed word), never from the request. */
export const top = (n: number, unit: string): Query => ({ where: `${UNMERGED} AND s.created_at >= now() - ($3::int * ('1 ' || $4)::interval)`, order: "s.score DESC, s.id DESC", params: [n, unit] });

export type TagRow = { id: number; tag: string; description: string | null; hotness_mod: number | null; quorum: number | null; privileged: boolean; permit_by_new_users: boolean; is_media: boolean };
const TAG = "SELECT id, tag, description, hotness_mod, quorum, privileged, permit_by_new_users, is_media FROM feed.tags";
/** Tags by name (case-insensitive), in the order asked; null if any is unknown (a 404, as Lobsters does). */
export async function findTags(names: string[]): Promise<TagRow[] | null> {
  if (!names.length || names.length > 20) return null;
  const rows: TagRow[] = (await (await conn()).query(`${TAG} WHERE lower(tag) = ANY($1::text[])`, [names.map((n) => n.toLowerCase())])).rows;
  const by = new Map(rows.map((r) => [r.tag.toLowerCase(), r]));
  const out = names.map((n) => by.get(n.toLowerCase()));
  return out.every(Boolean) ? (out as TagRow[]) : null;
}
/** Tag.related: the tags most often shared with this one (the Lobsters-specific "programming" exclusion is dropped). */
export async function relatedTags(tagId: number): Promise<TagRow[]> {
  return (await (await conn()).query(
    `SELECT t.id, t.tag, t.description, t.hotness_mod, t.quorum, t.privileged, t.permit_by_new_users, t.is_media FROM feed.tags t JOIN feed.taggings tg ON tg.tag_id = t.id
     WHERE t.active AND NOT t.is_media AND t.id <> $1 AND tg.story_id IN (SELECT story_id FROM feed.taggings WHERE tag_id = $1) GROUP BY t.id ORDER BY count(*) DESC, t.id LIMIT 8`, [tagId])).rows;
}
export async function findCategories(names: string[]): Promise<{ id: number; category: string }[] | null> {
  const rows = (await (await conn()).query("SELECT id, category FROM feed.categories WHERE lower(category) = ANY($1::text[])", [names.map((n) => n.toLowerCase())])).rows;
  return rows.length === new Set(names.map((n) => n.toLowerCase())).size ? rows : null;
}
export type Banned = { banned_at: Date | null; banned_reason: string | null; banned_by: string | null };
export async function findDomain(name: string) {
  return (await (await conn()).query(
    `SELECT d.id, d.domain, d.stories_count, d.banned_at, d.banned_reason, bu.username AS banned_by, (SELECT count(DISTINCT user_id)::int FROM feed.stories WHERE domain_id = d.id) AS n_submitters,
     (SELECT count(*)::int FROM feed.origins WHERE domain_id = d.id) AS n_origins FROM feed.domains d LEFT JOIN feed.users bu ON bu.id = d.banned_by_user_id WHERE lower(d.domain) = lower($1)`, [name])).rows[0] as ({ id: number; domain: string; stories_count: number; n_submitters: number; n_origins: number } & Banned) | undefined;
}
export async function findOrigin(identifier: string) {
  return (await (await conn()).query(
    `SELECT o.id, o.identifier, o.stories_count, d.domain, o.banned_at, o.banned_reason, bu.username AS banned_by, (SELECT count(DISTINCT user_id)::int FROM feed.stories WHERE origin_id = o.id) AS n_submitters
     FROM feed.origins o JOIN feed.domains d ON d.id = o.domain_id LEFT JOIN feed.users bu ON bu.id = o.banned_by_user_id WHERE lower(o.identifier) = lower($1)`, [identifier])).rows[0] as ({ id: number; identifier: string; stories_count: number; domain: string; n_submitters: number } & Banned) | undefined;
}
export async function findUser(username: string) {
  return (await (await conn()).query("SELECT id, username FROM feed.users WHERE lower(username) = lower($1)", [username])).rows[0] as { id: number; username: string } | undefined;
}
