import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { conn } from "../db";
import { s3 } from "../s3";
import { extractPdf } from "./extract";
import { cleanTags, isPdf, needsAck, safeName, slugify, titleFromFilename, TIERS, TYPES, visibleSql, type Viewer } from "./rules";

export type DocRow = { id: number; slug: string; title: string; description: string; type: string; tier: string; status: string; pinned: boolean; current_version: number; pages: number; has_text: boolean; has_thumb: boolean; owner: string; review_on: string | null; tags: string[]; folders: number[]; updated_at: Date };

// tsv weights: title and tags outrank the description, which outranks the text pulled from the PDF.
const TSV = `setweight(to_tsvector('english', d.title), 'A') || setweight(to_tsvector('english', coalesce((SELECT string_agg(t.name, ' ') FROM lib_doc_tags x JOIN lib_tags t ON t.id = x.tag_id WHERE x.doc_id = d.id), '')), 'A') || setweight(to_tsvector('english', d.description), 'B') || setweight(to_tsvector('english', left(coalesce((SELECT text_extract FROM lib_versions v WHERE v.doc_id = d.id AND v.version = d.current_version), ''), 500000)), 'C')`;
export async function reindex(id: number) {
  await (await conn()).query(`UPDATE lib_docs d SET tsv = ${TSV} WHERE d.id = $1`, [id]);
}

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
  if (o.trash && v.staff) where[0] = "d.deleted_at IS NOT NULL AND d.deleted_at > now() - interval '30 days'"; // the recycle bin
  const r = await (await conn()).query(`SELECT ${COLS}, ${snip} AS snippet FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE ${where.join(" AND ")} ORDER BY ${q ? rank + " DESC," : ""} d.pinned DESC, d.updated_at DESC LIMIT 200`, args);
  return r.rows;
}

/** One document by slug if the viewer may see it, else null (the same answer for "missing" and "not yours"). */
export async function getDoc(v: Viewer, slug: string) {
  const r = await (await conn()).query(`SELECT ${COLS}, v.s3_key, v.thumb_key, v.filename, v.size, d.copyright_note, (SELECT coalesce(max(r.version), 1) FROM lib_versions r WHERE r.doc_id = d.id AND r.requires_reread) AS reread_from FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE d.slug = $2 AND ${visibleSql(v, "$1")}`, [v.id, slug]);
  return r.rows[0] as (DocRow & { reread_from: number; s3_key: string; thumb_key: string | null; filename: string; size: number; copyright_note: string }) | undefined;
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

export type DocEdit = { title?: unknown; description?: unknown; type?: unknown; tier?: unknown; status?: unknown; pinned?: unknown; tags?: unknown; copyright_note?: unknown; owner?: unknown; review_on?: unknown };
/** Staff edit. Making a document public or listed needs `copyright_note` or an explicit `confirmed` so a manufacturer manual isn't published by accident. */
export async function editDoc(id: number, b: DocEdit & { confirmed?: unknown }) {
  const c = await conn(), set: string[] = [], args: unknown[] = [id];
  const put = (col: string, v: unknown) => { args.push(v); set.push(`${col} = $${args.length}`); };
  if (typeof b.title === "string" && b.title.trim()) put("title", b.title.trim().slice(0, 200));
  if (typeof b.description === "string") put("description", b.description.slice(0, 2000));
  if (typeof b.copyright_note === "string") put("copyright_note", b.copyright_note.slice(0, 500));
  if (typeof b.owner === "string") put("owner", b.owner.trim().slice(0, 100));
  if (b.review_on === null || b.review_on === "") put("review_on", null);
  else if (typeof b.review_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.review_on)) put("review_on", b.review_on);
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

/** Records that a member read the current version. Only for documents they may see and only for SOP/safety types; repeating it changes nothing. */
export async function acknowledge(v: Viewer, slug: string) {
  const d = v.id === null ? null : await getDoc(v, slug);
  if (!d || !needsAck(d.type)) throw new Error("That document doesn't need acknowledging.");
  await (await conn()).query("INSERT INTO lib_acks (user_id, doc_id, version) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [v.id, d.id, d.current_version]);
}
export async function ackState(userId: number, docId: number) {
  return (await (await conn()).query("SELECT version, at FROM lib_acks WHERE user_id = $1 AND doc_id = $2 ORDER BY version DESC LIMIT 1", [userId, docId])).rows[0] as { version: number; at: Date } | undefined;
}

/** Who has and hasn't read the current version of a document. "Should have read" = approved members who can see it (authorized tier: those authorized on a linked tool; staff tier: nobody). */
export async function ackReport(docId: number) {
  const c = await conn(), d = (await c.query("SELECT tier, current_version, (SELECT coalesce(max(r.version), 1) FROM lib_versions r WHERE r.doc_id = lib_docs.id AND r.requires_reread) AS reread_from FROM lib_docs WHERE id = $1", [docId])).rows[0];
  if (!d) throw new Error("That document doesn't exist.");
  const who = d.tier === "staff" ? "false" : d.tier === "authorized" ? "EXISTS (SELECT 1 FROM tool_docs td JOIN tool_auths ta ON ta.tool_id = td.tool_id WHERE td.doc_id = $1 AND ta.user_id = u.id AND (ta.expires_on IS NULL OR ta.expires_on >= current_date))" : "true";
  const r = await c.query(`SELECT u.id, u.name, (SELECT max(a.at) FROM lib_acks a WHERE a.user_id = u.id AND a.doc_id = $1 AND a.version >= $2) AS at FROM site_users u WHERE u.approval = 'approved' AND u.disabled_at IS NULL AND ${who} ORDER BY lower(u.name) LIMIT 1000`, [docId, d.reread_from]);
  return { version: d.current_version, read: r.rows.filter((x) => x.at).map((x) => ({ name: x.name, at: x.at })), unread: r.rows.filter((x) => !x.at).map((x) => x.name) };
}

/** Adds a new file to a document as its next version. Old versions are kept (staff can open them). A version flagged `reread` asks everyone to acknowledge again; one that isn't carries earlier acknowledgements forward. */
export async function addVersion(docId: number, file: { name: string; bytes: Buffer }, o: { note?: unknown; reread?: unknown }, who: string): Promise<number> {
  if (!isPdf(file.bytes)) throw new Error(`${file.name}: only PDF files are accepted.`);
  const store = await s3(), c = await conn();
  if (!store) throw new Error("File storage isn't set up.");
  const cur = (await c.query("SELECT v.s3_key FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE d.id = $1 AND d.deleted_at IS NULL", [docId])).rows[0];
  if (!cur) throw new Error("That document doesn't exist.");
  const info = await extractPdf(file.bytes).catch((e) => { throw new Error(`${file.name}: ${e.message}`); });
  const dir = cur.s3_key.replace(/\/v\d+\.pdf$/, ""), tx = await c.connect();
  let version = 0, key = "";
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT 1 FROM lib_docs WHERE id = $1 FOR UPDATE", [docId]); // two uploads at once take turns
    version = (await tx.query("SELECT max(version) + 1 AS n FROM lib_versions WHERE doc_id = $1", [docId])).rows[0].n;
    key = `${dir}/v${version}.pdf`;
    const thumb = info.thumb ? `${dir}/thumb-v${version}.webp` : null, text = info.text.trim();
    await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: file.bytes, ContentType: "application/pdf" }));
    if (thumb) await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: thumb, Body: Buffer.from(info.thumb, "base64"), ContentType: "image/webp" }));
    await tx.query("INSERT INTO lib_versions (doc_id, version, s3_key, filename, size, pages, has_text, text_extract, thumb_key, change_note, requires_reread, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [docId, version, key, safeName(file.name), file.bytes.length, info.pages, text.length > 20, text, thumb, typeof o.note === "string" ? o.note.slice(0, 500) : "", o.reread === true, who]);
    await tx.query("UPDATE lib_docs SET current_version = $2, updated_at = now() WHERE id = $1", [docId, version]);
    await tx.query("COMMIT");
  } catch (e) { await tx.query("ROLLBACK").catch(() => {}); throw e; } finally { tx.release(); }
  await reindex(docId);
  return version;
}

export const versionsOf = async (docId: number) => (await (await conn()).query("SELECT version, filename, size, pages, change_note, requires_reread, uploaded_by, at FROM lib_versions WHERE doc_id = $1 ORDER BY version DESC", [docId])).rows;
/** s3 key of one stored version (staff only; the caller checks). */
export const versionKey = async (docId: number, version: number) => (await (await conn()).query("SELECT s3_key FROM lib_versions WHERE doc_id = $1 AND version = $2", [docId, version])).rows[0]?.s3_key as string | undefined;
