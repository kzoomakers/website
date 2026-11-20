import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { tx } from "./submit";

// Tag and category admin (mod/tags_controller, categories_controller, tag.rb, category.rb). Admins only, as Lobsters' require_logged_in_admin. Every change is written to the public moderation log.

export const NAME_MAX = 25, DESCRIPTION_MAX = 100;
const NAME = /^[A-Za-z0-9_-]+$/;
export type Saved = { ok: true; name: string } | { ok: false; error: string };
const bad = (error: string): Saved => ({ ok: false, error });

export type TagInput = { tag: string; category: string; description: string; quorum: string; hotness_mod: string; permit_by_new_users: boolean; privileged: boolean; is_media: boolean; active: boolean };
export type TagForm = Omit<TagInput, "quorum" | "hotness_mod"> & { quorum: string; hotness_mod: string };

const COLS = ["tag", "description", "privileged", "is_media", "active", "hotness_mod", "permit_by_new_users", "category_id", "quorum"] as const;
const show = (v: unknown) => (v == null ? "" : String(v));

async function admin(c: PoolClient, id: number) {
  const u = (await c.query("SELECT is_admin, banned_at, deleted_at FROM feed.users WHERE id = $1", [id])).rows[0];
  return !!u?.is_admin && !u.banned_at && !u.deleted_at;
}
const log = (c: PoolClient, adminId: number, col: "tag_id" | "category_id", id: number, action: string) =>
  c.query(`INSERT INTO feed.moderations (moderator_user_id, ${col}, action, token) VALUES ($1, $2, $3, $4)`, [adminId, id, action, `moderation_${randomBytes(16).toString("hex")}`]); // col is one of two fixed names
const created = (kind: string, row: Record<string, unknown>) => `Created new ${kind} ` + Object.entries(row).map(([f, v]) => `with ${f} '${show(v)}'`).join(", ");
const changed = (kind: string, name: string, before: Record<string, unknown>, after: Record<string, unknown>) => {
  const diffs = Object.keys(after).filter((f) => show(before[f]) !== show(after[f])).map((f) => `changed ${f} from '${show(before[f])}' to '${show(after[f])}'`);
  return diffs.length ? `Updating ${kind} ${name}, ${diffs.join(", ")}` : null;
};
const taken = (e: unknown) => (e as { code?: string })?.code === "23505";

/** Create (`current` null) or update the tag called `current`. Validation follows tag.rb. */
export const saveTag = (adminId: number, current: string | null, i: TagInput): Promise<Saved> => tx(async (c) => {
  if (!(await admin(c, adminId))) return bad("not permitted");
  const tag = i.tag.trim(), description = i.description.trim() || null;
  if (!tag) return bad("Tag can't be blank");
  if (tag.length > NAME_MAX) return bad(`Tag is too long (maximum is ${NAME_MAX} characters)`);
  if (!NAME.test(tag)) return bad("Tag is invalid");
  if (description && description.length > DESCRIPTION_MAX) return bad(`Description is too long (maximum is ${DESCRIPTION_MAX} characters)`);
  const hot = Number(i.hotness_mod.trim());
  if (!i.hotness_mod.trim() || !Number.isFinite(hot) || hot < -10 || hot > 10) return bad("Hotness mod is not included in the list");
  const q = i.quorum.trim(), quorum = q === "" ? null : Number(q);
  if (quorum !== null && !Number.isInteger(quorum)) return bad("Quorum is not a number");
  if (quorum !== null && Math.abs(quorum) > 1e6) return bad("Quorum is out of range");
  const cat = (await c.query("SELECT id FROM feed.categories WHERE lower(category) = lower($1)", [i.category])).rows[0];
  if (!cat) return bad("Category must exist");
  const old = current === null ? null : (await c.query("SELECT * FROM feed.tags WHERE lower(tag) = lower($1) FOR UPDATE", [current])).rows[0];
  if (current !== null && !old) return bad("No such tag");
  if ((await c.query("SELECT 1 FROM feed.tags WHERE lower(tag) = lower($1) AND id IS DISTINCT FROM $2", [tag, old?.id ?? null])).rowCount) return bad("Tag has already been taken");
  const v = { tag, description, privileged: i.privileged, is_media: i.is_media, active: i.active, hotness_mod: hot, permit_by_new_users: i.permit_by_new_users, category_id: Number(cat.id), quorum };
  try {
    if (!old) {
      const row = (await c.query(`INSERT INTO feed.tags (tag, description, privileged, is_media, active, hotness_mod, permit_by_new_users, category_id, quorum, token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, ${COLS.join(", ")}`,
        [...COLS.map((k) => v[k]), `tag_${randomBytes(16).toString("hex")}`])).rows[0];
      await log(c, adminId, "tag_id", row.id, created("tag", row));
    } else {
      const action = changed("tag", tag, old, v);
      if (action) {
        await c.query("UPDATE feed.tags SET tag=$1, description=$2, privileged=$3, is_media=$4, active=$5, hotness_mod=$6, permit_by_new_users=$7, category_id=$8, quorum=$9, updated_at=now() WHERE id=$10", [...COLS.map((k) => v[k]), old.id]);
        await log(c, adminId, "tag_id", old.id, action);
      }
    }
  } catch (e) { if (taken(e)) return bad("Tag has already been taken"); throw e; }
  return { ok: true, name: tag };
});

/** Create (`current` null) or rename the category called `current`. */
export const saveCategory = (adminId: number, current: string | null, name: string): Promise<Saved> => tx(async (c) => {
  if (!(await admin(c, adminId))) return bad("not permitted");
  name = name.trim();
  if (!name) return bad("Category can't be blank");
  if (name.length > NAME_MAX) return bad(`Category is too long (maximum is ${NAME_MAX} characters)`);
  if (!NAME.test(name)) return bad("Category is invalid");
  const old = current === null ? null : (await c.query("SELECT id, category FROM feed.categories WHERE lower(category) = lower($1) FOR UPDATE", [current])).rows[0];
  if (current !== null && !old) return bad("No such category");
  if ((await c.query("SELECT 1 FROM feed.categories WHERE lower(category) = lower($1) AND id IS DISTINCT FROM $2", [name, old?.id ?? null])).rowCount) return bad("Category has already been taken");
  try {
    if (!old) {
      const row = (await c.query("INSERT INTO feed.categories (category, token) VALUES ($1, $2) RETURNING id, category", [name, `category_${randomBytes(16).toString("hex")}`])).rows[0];
      await log(c, adminId, "category_id", row.id, created("category", row));
    } else {
      const action = changed("category", name, old, { category: name });
      if (action) { await c.query("UPDATE feed.categories SET category = $1, updated_at = now() WHERE id = $2", [name, old.id]); await log(c, adminId, "category_id", old.id, action); }
    }
  } catch (e) { if (taken(e)) return bad("Category has already been taken"); throw e; }
  return { ok: true, name };
});

export type TagRowAdmin = { tag: string; description: string | null; privileged: boolean; is_media: boolean; active: boolean; hotness_mod: number | null; permit_by_new_users: boolean; quorum: number | null; category: string };
export const getTagAdmin = async (name: string): Promise<TagRowAdmin | null> =>
  (await (await conn()).query("SELECT t.tag, t.description, t.privileged, t.is_media, t.active, t.hotness_mod, t.permit_by_new_users, t.quorum, c.category FROM feed.tags t JOIN feed.categories c ON c.id = t.category_id WHERE lower(t.tag) = lower($1)", [name])).rows[0] ?? null;
export const getCategoryName = async (name: string): Promise<string | null> =>
  (await (await conn()).query("SELECT category FROM feed.categories WHERE lower(category) = lower($1)", [name])).rows[0]?.category ?? null;
export const categoryNames = async (): Promise<string[]> => (await (await conn()).query("SELECT category FROM feed.categories ORDER BY lower(category)")).rows.map((r) => r.category);

export type TagsIndex = { category: string; tags: { tag: string; description: string | null; is_media: boolean; active: boolean }[] }[];
/** tags#index: every category, A to Z, with its tags A to Z (inactive ones included, marked). */
export async function tagsIndex(): Promise<TagsIndex> {
  const r = await (await conn()).query(
    `SELECT c.category, COALESCE(json_agg(json_build_object('tag', t.tag, 'description', t.description, 'is_media', t.is_media, 'active', t.active) ORDER BY lower(t.tag)) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
     FROM feed.categories c LEFT JOIN feed.tags t ON t.category_id = c.id GROUP BY c.id, c.category ORDER BY lower(c.category)`);
  return r.rows;
}
