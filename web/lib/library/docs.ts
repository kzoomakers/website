import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { conn } from "../db";
import { s3 } from "../s3";
import { extractPdf } from "./extract";
import { cleanTags, isPdf, safeName, slugify, titleFromFilename, TIERS, TYPES, visibleSql, type Viewer } from "./rules";

export type DocRow = { id: number; slug: string; title: string; description: string; type: string; tier: string; status: string; pinned: boolean; current_version: number; pages: number; has_text: boolean; has_thumb: boolean; tags: string[]; folders: number[]; updated_at: Date };

// tsv weights: title and tags outrank the description, which outranks the text pulled from the PDF.
const TSV = `setweight(to_tsvector('english', d.title), 'A') || setweight(to_tsvector('english', coalesce((SELECT string_agg(t.name, ' ') FROM lib_doc_tags x JOIN lib_tags t ON t.id = x.tag_id WHERE x.doc_id = d.id), '')), 'A') || setweight(to_tsvector('english', d.description), 'B') || setweight(to_tsvector('english', left(coalesce((SELECT text_extract FROM lib_versions v WHERE v.doc_id = d.id AND v.version = d.current_version), ''), 500000)), 'C')`;
export async function reindex(id: number) {
  await (await conn()).query(`UPDATE lib_docs d SET tsv = ${TSV} WHERE d.id = $1`, [id]);
}

const COLS = `d.id, d.slug, d.title, d.description, d.type, d.tier, d.status, d.pinned, d.current_version, d.updated_at, v.pages, v.has_text, v.thumb_key IS NOT NULL AS has_thumb,
  coalesce((SELECT array_agg(t.name ORDER BY t.name) FROM lib_doc_tags x JOIN lib_tags t ON t.id = x.tag_id WHERE x.doc_id = d.id), '{}') AS tags,
  coalesce((SELECT array_agg(p.folder_id) FROM lib_placements p WHERE p.doc_id = d.id), '{}') AS folders`;

/** Documents the viewer may see, newest first (pinned first). `q` searches title, tags, description and PDF text; `tag` and `folder` narrow it. */
export async function listDocs(v: Viewer, o: { q?: string; tag?: string; folder?: number[]; needsDetails?: boolean; trash?: boolean } = {}): Promise<(DocRow & { snippet?: string })[]> {
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
  if (o.trash && v.staff) where[0] = "d.deleted_at IS NOT NULL AND d.deleted_at > now() - interval '30 days'"; // the recycle bin
  const r = await (await conn()).query(`SELECT ${COLS}, ${snip} AS snippet FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE ${where.join(" AND ")} ORDER BY ${q ? rank + " DESC," : ""} d.pinned DESC, d.updated_at DESC LIMIT 200`, args);
  return r.rows;
}

/** One document by slug if the viewer may see it, else null (the same answer for "missing" and "not yours"). */
export async function getDoc(v: Viewer, slug: string) {
  const r = await (await conn()).query(`SELECT ${COLS}, v.s3_key, v.thumb_key, v.filename, v.size, d.copyright_note FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE d.slug = $2 AND ${visibleSql(v, "$1")}`, [v.id, slug]);
  return r.rows[0] as (DocRow & { s3_key: string; thumb_key: string | null; filename: string; size: number; copyright_note: string }) | undefined;
}

export async function tagList(v: Viewer) {
  return (await (await conn()).query(`SELECT t.name, t.slug, count(*)::int AS n FROM lib_tags t JOIN lib_doc_tags x ON x.tag_id = t.id JOIN lib_docs d ON d.id = x.doc_id WHERE ${visibleSql(v, "$1")} GROUP BY t.id ORDER BY lower(t.name)`, [v.id])).rows as { name: string; slug: string; n: number }[];
}

/** Stores one uploaded PDF as a new draft (staff-only until someone sets the tier), titled from its filename. Returns the slug. */
export async function addUpload(file: { name: string; bytes: Buffer }, who: string): Promise<string> {
  if (!isPdf(file.bytes)) throw new Error(`${file.name}: only PDF files are accepted.`);
  const store = await s3();
  if (!store) throw new Error("File storage isn't set up.");
  const info = await extractPdf(file.bytes).catch((e) => { throw new Error(`${file.name}: ${e.message}`); });
  const key = `lib/${randomBytes(12).toString("hex")}/v1.pdf`;
  await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: file.bytes, ContentType: "application/pdf" }));
  const thumb = info.thumb ? key.replace(/v1\.pdf$/, "thumb.webp") : null;
  if (thumb) await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: thumb, Body: Buffer.from(info.thumb, "base64"), ContentType: "image/webp" }));
  const c = await conn(), title = titleFromFilename(file.name), base = slugify(title);
  for (let n = 0; ; n++) {
    const slug = n ? `${base}-${n + 1}` : base;
    try {
      const d = await c.query("INSERT INTO lib_docs (slug, title, created_by) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING RETURNING id", [slug, title, who]);
      if (!d.rowCount) continue;
      const text = info.text.trim();
      await c.query("INSERT INTO lib_versions (doc_id, version, s3_key, filename, size, pages, has_text, text_extract, uploaded_by, thumb_key) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9)", [d.rows[0].id, key, safeName(file.name), file.bytes.length, info.pages, text.length > 20, text, who, thumb]);
      await reindex(d.rows[0].id);
      return slug;
    } catch (e) { if (n > 20) throw e; }
  }
}

export type DocEdit = { title?: unknown; description?: unknown; type?: unknown; tier?: unknown; status?: unknown; pinned?: unknown; tags?: unknown; copyright_note?: unknown };
/** Staff edit. Making a document public or listed needs `copyright_note` or an explicit `confirmed` so a manufacturer manual isn't published by accident. */
export async function editDoc(id: number, b: DocEdit & { confirmed?: unknown }) {
  const c = await conn(), set: string[] = [], args: unknown[] = [id];
  const put = (col: string, v: unknown) => { args.push(v); set.push(`${col} = $${args.length}`); };
  if (typeof b.title === "string" && b.title.trim()) put("title", b.title.trim().slice(0, 200));
  if (typeof b.description === "string") put("description", b.description.slice(0, 2000));
  if (typeof b.copyright_note === "string") put("copyright_note", b.copyright_note.slice(0, 500));
  if (TYPES.includes(b.type as any)) put("type", b.type);
  if (TIERS.includes(b.tier as any)) {
    if (b.tier === "public" && b.confirmed !== true) throw new Error("Public documents can be read by anyone. Confirm you have the right to publish this one (manufacturer manuals are often copyrighted).");
    put("tier", b.tier);
  }
  if (["draft", "published", "archived"].includes(b.status as string)) put("status", b.status);
  if (typeof b.pinned === "boolean") put("pinned", b.pinned);
  if (set.length) await c.query(`UPDATE lib_docs SET ${set.join(", ")}, updated_at = now() WHERE id = $1 AND deleted_at IS NULL`, args);
  if (b.tags !== undefined) {
    await c.query("DELETE FROM lib_doc_tags WHERE doc_id = $1", [id]);
    for (const name of cleanTags(b.tags)) {
      const t = await c.query("INSERT INTO lib_tags (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id", [name, slugify(name)]);
      await c.query("INSERT INTO lib_doc_tags VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, t.rows[0].id]);
    }
  }
  await reindex(id);
}

export const deleteDoc = async (id: number) => { await (await conn()).query("UPDATE lib_docs SET deleted_at = now() WHERE id = $1", [id]); };
export const restoreDoc = async (id: number) => { await (await conn()).query("UPDATE lib_docs SET deleted_at = NULL WHERE id = $1", [id]); };

/** The PDF bytes of a document's current version, or null. Callers must already have checked who may see it. */
export async function fileBytes(key: string): Promise<Uint8Array | null> {
  const st = await s3();
  if (!st) return null;
  const r = await st.client.send(new GetObjectCommand({ Bucket: st.bucket, Key: key })).catch(() => null);
  return r?.Body ? r.Body.transformToByteArray() : null;
}

/** Removes documents that have sat in the recycle bin for 30 days, with their files. Run by the retention job. */
export async function purgeTrash() {
  const c = await conn(), st = await s3();
  const old = (await c.query("SELECT id FROM lib_docs WHERE deleted_at < now() - interval '30 days'")).rows.map((r) => r.id);
  for (const id of old) {
    const keys = (await c.query("SELECT s3_key, thumb_key FROM lib_versions WHERE doc_id = $1", [id])).rows.flatMap((r) => [r.s3_key, r.thumb_key].filter(Boolean));
    if (st) for (const k of keys) await st.client.send(new DeleteObjectCommand({ Bucket: st.bucket, Key: k })).catch(() => {});
    await c.query("DELETE FROM lib_docs WHERE id = $1", [id]);
  }
}

/** Sets tier, status, folder, or adds tags on many documents at once (the bulk toolbar). Each field is optional. */
export async function bulkEdit(ids: number[], b: { tier?: unknown; status?: unknown; folder?: unknown; addTags?: unknown; confirmed?: unknown }) {
  for (const id of ids.slice(0, 200)) {
    await editDoc(id, { tier: b.tier, status: b.status, confirmed: b.confirmed });
    if (b.folder !== undefined && b.folder !== "") await (await conn()).query("INSERT INTO lib_placements (doc_id, folder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, Number(b.folder)]);
    if (cleanTags(b.addTags).length) {
      const have = (await (await conn()).query("SELECT t.name FROM lib_doc_tags x JOIN lib_tags t ON t.id = x.tag_id WHERE x.doc_id = $1", [id])).rows.map((r) => r.name);
      await editDoc(id, { tags: [...have, ...cleanTags(b.addTags)] });
    }
  }
}

export const allTags = async () => (await (await conn()).query("SELECT t.id, t.name, (SELECT count(*)::int FROM lib_doc_tags x WHERE x.tag_id = t.id) AS n FROM lib_tags t ORDER BY lower(t.name)")).rows as { id: number; name: string; n: number }[];

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
  for (const d of docs) await reindex(d);
}
