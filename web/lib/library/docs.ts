import type { PoolClient } from "pg";
import { conn, withTx } from "../db";
import { reindex } from "./search";
import { tagIds } from "./tags";
import { cleanTags, rereadFrom, TIERS, TYPES, useParam, visibleSql, type Viewer } from "./rules";
import { dropKeys } from "./store";

export type DocRow = { id: number; slug: string; title: string; description: string; type: string; tier: string; status: string; pinned: boolean; current_version: number; pages: number; has_text: boolean; has_thumb: boolean; owner: string; review_on: string | null; tags: string[]; folders: number[]; updated_at: Date };

const COLS = `d.id, d.slug, d.title, d.description, d.type, d.tier, d.status, d.pinned, d.current_version, d.updated_at, d.owner, to_char(d.review_on, 'YYYY-MM-DD') AS review_on, v.pages, v.has_text, v.thumb_key IS NOT NULL AS has_thumb,
  coalesce((SELECT array_agg(t.name ORDER BY t.name) FROM lib_doc_tags x JOIN lib_tags t ON t.id = x.tag_id WHERE x.doc_id = d.id), '{}') AS tags,
  coalesce((SELECT array_agg(p.folder_id) FROM lib_placements p WHERE p.doc_id = d.id), '{}') AS folders`;

/** Documents the viewer may see, newest first (pinned first). `q` searches title, tags, description and PDF text; `tag` and `folder` narrow it. */
export async function listDocs(v: Viewer, o: { q?: string; tag?: string; folder?: number[]; needsDetails?: boolean; trash?: boolean; overdue?: boolean } = {}): Promise<(DocRow & { snippet?: string })[]> {
  const args: unknown[] = [v.id], where = [visibleSql(v, "$1")];
  let rank = "0", snip = "NULL";
  const q = (o.q ?? "").trim().slice(0, 200);
  if (q) {
    args.push(q);
    where.push(`d.tsv @@ websearch_to_tsquery('english', $${args.length})`);
    rank = `ts_rank(d.tsv, websearch_to_tsquery('english', $${args.length}))`;
    snip = `ts_headline('english', left(v.text_extract, 200000), websearch_to_tsquery('english', $${args.length}), 'MaxFragments=1,MaxWords=25,MinWords=10,StartSel=<<,StopSel=>>')`;
  }
  if (o.tag) { args.push(o.tag); where.push(`EXISTS (SELECT 1 FROM lib_doc_tags x JOIN lib_tags t ON t.id = x.tag_id WHERE x.doc_id = d.id AND t.slug = $${args.length})`); }
  if (o.folder?.length) { args.push(o.folder); where.push(`EXISTS (SELECT 1 FROM lib_placements p WHERE p.doc_id = d.id AND p.folder_id = ANY($${args.length}))`); }
  if (o.needsDetails && v.staff) where.push("d.status = 'draft'");
  if (o.overdue && v.staff) where.push("d.review_on < current_date AND d.status = 'published'");
  if (o.trash && v.staff) where[0] = `d.deleted_at IS NOT NULL AND d.deleted_at > now() - interval '30 days' AND ${useParam("$1")}`; // the recycle bin
  const r = await (await conn()).query(`SELECT ${COLS}, ${snip} AS snippet FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE ${where.join(" AND ")} ORDER BY ${q ? rank + " DESC," : ""} d.pinned DESC, d.updated_at DESC LIMIT 200`, args);
  return r.rows;
}

/** One document by slug if the viewer may see it, else null (the same answer for "missing" and "not yours"). */
export async function getDoc(v: Viewer, slug: string) {
  const r = await (await conn()).query(`SELECT ${COLS}, v.s3_key, v.thumb_key, v.filename, v.size, d.copyright_note, ${rereadFrom("d")} AS reread_from FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE d.slug = $2 AND ${visibleSql(v, "$1")}`, [v.id, slug]);
  return r.rows[0] as (DocRow & { reread_from: number; s3_key: string; thumb_key: string | null; filename: string; size: number; copyright_note: string }) | undefined;
}

export async function tagList(v: Viewer) {
  return (await (await conn()).query(`SELECT t.name, t.slug, count(*)::int AS n FROM lib_tags t JOIN lib_doc_tags x ON x.tag_id = t.id JOIN lib_docs d ON d.id = x.doc_id WHERE ${visibleSql(v, "$1")} GROUP BY t.id ORDER BY lower(t.name)`, [v.id])).rows as { name: string; slug: string; n: number }[];
}

const SETTABLE_STATUS = ["draft", "published", "archived"];
/** Making documents public needs an explicit confirmation, but only for ones that aren't public already. */
async function mustConfirmPublic(c: PoolClient, ids: number[], confirmed: unknown) {
  if (confirmed !== true && (await c.query("SELECT 1 FROM lib_docs WHERE id = ANY($1) AND tier <> 'public' AND deleted_at IS NULL", [ids])).rowCount)
    throw new Error("Public documents can be read by anyone. Confirm you have the right to publish them (manufacturer manuals are often copyrighted).");
}

export type DocEdit = { title?: unknown; description?: unknown; type?: unknown; tier?: unknown; status?: unknown; pinned?: unknown; tags?: unknown; copyright_note?: unknown; owner?: unknown; review_on?: unknown };
/** Staff edit, all or nothing. The search text is rebuilt only when the title, description or tags changed. */
export async function editDoc(id: number, b: DocEdit & { confirmed?: unknown }) {
  await withTx(async (c) => {
    const set: string[] = [], args: unknown[] = [id];
    const put = (col: string, v: unknown) => { args.push(v); set.push(`${col} = $${args.length}`); };
    if (!(await c.query("SELECT 1 FROM lib_docs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id])).rowCount) throw new Error("That document doesn't exist.");
    let search = false;
    if (typeof b.title === "string" && b.title.trim()) { put("title", b.title.trim().slice(0, 200)); search = true; }
    if (typeof b.description === "string") { put("description", b.description.slice(0, 2000)); search = true; }
    if (typeof b.copyright_note === "string") put("copyright_note", b.copyright_note.slice(0, 500));
    if (typeof b.owner === "string") put("owner", b.owner.trim().slice(0, 100));
    if (b.review_on === null || b.review_on === "") put("review_on", null);
    else if (typeof b.review_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.review_on)) put("review_on", b.review_on);
    if (TYPES.includes(b.type as any)) put("type", b.type);
    if (TIERS.includes(b.tier as any)) { if (b.tier === "public") await mustConfirmPublic(c, [id], b.confirmed); put("tier", b.tier); }
    if (SETTABLE_STATUS.includes(b.status as string)) put("status", b.status);
    if (typeof b.pinned === "boolean") put("pinned", b.pinned);
    if (set.length) await c.query(`UPDATE lib_docs SET ${set.join(", ")}, updated_at = now() WHERE id = $1`, args);
    if (b.tags !== undefined) {
      await c.query("DELETE FROM lib_doc_tags WHERE doc_id = $1", [id]);
      const ids = await tagIds(c, cleanTags(b.tags));
      if (ids.length) await c.query("INSERT INTO lib_doc_tags SELECT $1, t FROM unnest($2::int[]) t ON CONFLICT DO NOTHING", [id, ids]);
      search = true;
    }
    if (search) await reindex([id], c);
  });
}

/** The bulk toolbar: set tier and/or status, add to a folder, add tags, on up to 200 documents, all or nothing, in a handful of statements. */
export async function bulkEdit(idsIn: number[], b: { tier?: unknown; status?: unknown; folder?: unknown; addTags?: unknown; confirmed?: unknown }) {
  const ids = [...new Set(idsIn)].slice(0, 200);
  if (!ids.length) return;
  await withTx(async (c) => {
    const set: string[] = [], args: unknown[] = [ids];
    if (TIERS.includes(b.tier as any)) { if (b.tier === "public") await mustConfirmPublic(c, ids, b.confirmed); args.push(b.tier); set.push(`tier = $${args.length}`); }
    if (SETTABLE_STATUS.includes(b.status as string)) { args.push(b.status); set.push(`status = $${args.length}`); }
    if (set.length) await c.query(`UPDATE lib_docs SET ${set.join(", ")}, updated_at = now() WHERE id = ANY($1) AND deleted_at IS NULL`, args);
    const folder = Number(b.folder);
    if (b.folder !== undefined && b.folder !== "" && Number.isInteger(folder)) await c.query("INSERT INTO lib_placements (doc_id, folder_id) SELECT d, $2 FROM unnest($1::int[]) d ON CONFLICT DO NOTHING", [ids, folder]);
    const names = cleanTags(b.addTags);
    if (names.length) {
      await c.query("INSERT INTO lib_doc_tags SELECT d, t FROM unnest($1::int[]) d CROSS JOIN unnest($2::int[]) t ON CONFLICT DO NOTHING", [ids, await tagIds(c, names)]);
      await reindex(ids, c);
    }
  });
}

export const deleteDoc = async (id: number) => { await (await conn()).query("UPDATE lib_docs SET deleted_at = now() WHERE id = $1", [id]); };
export const restoreDoc = async (id: number) => { await (await conn()).query("UPDATE lib_docs SET deleted_at = NULL WHERE id = $1", [id]); };

/** Removes documents that have sat in the recycle bin for 30 days, with their files. A document whose files couldn't all be deleted stays (still in the bin) and is tried again on the next run. */
export async function purgeTrash() {
  const c = await conn();
  for (const { id } of (await c.query("SELECT id FROM lib_docs WHERE deleted_at < now() - interval '30 days'")).rows) {
    const keys = (await c.query("SELECT s3_key, thumb_key FROM lib_versions WHERE doc_id = $1", [id])).rows.flatMap((r) => [r.s3_key, r.thumb_key]);
    if (await dropKeys(keys)) await c.query("DELETE FROM lib_docs WHERE id = $1", [id]);
  }
}

export const versionsOf = async (docId: number) => (await (await conn()).query("SELECT version, filename, size, pages, change_note, requires_reread, uploaded_by, at FROM lib_versions WHERE doc_id = $1 ORDER BY version DESC", [docId])).rows;

/** The document and the stored file to serve for it: the current version, or (staff only) an older one. Undefined when the viewer may not see it. */
export async function fileFor(v: Viewer, slug: string, version?: number) {
  const d = await getDoc(v, slug);
  if (!d) return undefined;
  const key = v.staff && Number.isInteger(version) && version! > 0 ? (await (await conn()).query("SELECT s3_key FROM lib_versions WHERE doc_id = $1 AND version = $2", [d.id, version])).rows[0]?.s3_key as string | undefined : d.s3_key;
  return key ? { d, key } : undefined;
}
