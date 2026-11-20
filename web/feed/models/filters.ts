import { conn } from "@/lib/db";
import { tx } from "./submit";

// /filters (filters_controller, tag.rb user_can_filter?): the tags a signed-in person hides from the story lists. shortcut: Lobsters also keeps a logged-out cookie; here you need an account.

export type FilterRow = { id: number; tag: string; description: string | null; is_media: boolean; active: boolean; hotness_mod: number | null; privileged: boolean; stories: number; filtering: number; filtered: boolean };
export type FilterIndex = { category: string; tags: FilterRow[] }[];

export async function filtersIndex(userId: number): Promise<FilterIndex> {
  const r = await (await conn()).query(
    `SELECT c.category, t.id, t.tag, t.description, t.is_media, t.active, t.hotness_mod, t.privileged,
       (SELECT count(*)::int FROM feed.taggings g WHERE g.tag_id = t.id) AS stories, (SELECT count(*)::int FROM feed.tag_filters f WHERE f.tag_id = t.id) AS filtering,
       EXISTS (SELECT 1 FROM feed.tag_filters f WHERE f.tag_id = t.id AND f.user_id = $1) AS filtered
     FROM feed.categories c JOIN feed.tags t ON t.category_id = c.id WHERE t.active ORDER BY lower(c.category), lower(t.tag)`, [userId]);
  const out: FilterIndex = [];
  for (const row of r.rows) { const { category, ...t } = row; (out.at(-1)?.category === category ? out.at(-1)! : out[out.push({ category, tags: [] }) - 1]).tags.push(t); }
  return out;
}

/** Replaces the person's filters with `names`: only active tags, and privileged tags only for moderators (Tag#user_can_filter?). Unknown names are ignored. */
export const saveFilters = (userId: number, isModerator: boolean, names: string[]) => tx(async (c) => {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('feed:filters:' || $1::text, 0))", [userId]);
  const ids = (await c.query("SELECT id FROM feed.tags WHERE active AND (NOT privileged OR $2) AND tag = ANY($1::text[])", [names, isModerator])).rows.map((r) => r.id);
  await c.query("DELETE FROM feed.tag_filters WHERE user_id = $1", [userId]);
  if (ids.length) await c.query("INSERT INTO feed.tag_filters (user_id, tag_id) SELECT $1, unnest($2::bigint[])", [userId, ids]);
  return { ok: true as const, count: ids.length };
});
