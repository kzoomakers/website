import type { PoolClient } from "pg";
import { conn } from "../db";
import { reindex } from "./search";
import { cleanTags, slugify } from "./rules";

export const allTags = async () => (await (await conn()).query("SELECT t.id, t.name, (SELECT count(*)::int FROM lib_doc_tags x WHERE x.tag_id = t.id) AS n FROM lib_tags t ORDER BY lower(t.name)")).rows as { id: number; name: string; n: number }[];

/** Ids of these tag names, creating the ones that don't exist. */
export async function tagIds(c: PoolClient, names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) ids.push((await c.query("INSERT INTO lib_tags (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id", [name, slugify(name)])).rows[0].id);
  return ids;
}

/** Renames a tag; if another tag already has that name's slug, the two are merged (documents keep one tag). Search text is refreshed for every document touched. */
export async function renameTag(id: number, name: string) {
  const c = await conn(), n = cleanTags([name])[0];
  if (!n) throw new Error("Give the tag a name.");
  const clash = (await c.query("SELECT id FROM lib_tags WHERE slug = $1 AND id <> $2", [slugify(n), id])).rows[0]?.id;
  const docs = (await c.query("SELECT doc_id FROM lib_doc_tags WHERE tag_id = ANY($1)", [[id, clash ?? id]])).rows.map((r) => r.doc_id);
  if (clash) {
    await c.query("INSERT INTO lib_doc_tags SELECT doc_id, $2 FROM lib_doc_tags WHERE tag_id = $1 ON CONFLICT DO NOTHING", [id, clash]);
    await c.query("DELETE FROM lib_tags WHERE id = $1", [id]);
  } else await c.query("UPDATE lib_tags SET name = $2, slug = $3 WHERE id = $1", [id, n, slugify(n)]);
  await reindex(docs);
}
