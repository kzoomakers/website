import { randomBytes } from "node:crypto";
import { conn, withTx } from "../db";
import { extractPdf } from "./extract";
import { reindex } from "./search";
import { isPdf, safeName, slugify, titleFromFilename } from "./rules";
import { dropKeys, putPdf } from "./store";

type Upload = { name: string; bytes: Buffer };
const read = async (file: Upload) => {
  if (!isPdf(file.bytes)) throw new Error(`${file.name}: only PDF files are accepted.`);
  return extractPdf(file.bytes).catch((e) => { throw new Error(`${file.name}: ${e.message}`); });
};

/** Stores one uploaded PDF as a new draft (staff-only until someone sets the tier), titled from its filename. Document and first version are written together; if that fails the files are removed. Returns the slug. */
export async function addUpload(file: Upload, who: string): Promise<string> {
  const info = await read(file), stored = await putPdf(`lib/${randomBytes(12).toString("hex")}`, "v1", file.bytes, info.thumb);
  const title = titleFromFilename(file.name), base = slugify(title), text = info.text.trim();
  try {
    const { slug, id } = await withTx(async (c) => {
      for (let n = 0; n < 50; n++) {
        const slug = n ? `${base}-${n + 1}` : base;
        const d = await c.query("INSERT INTO lib_docs (slug, title, created_by) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING RETURNING id", [slug, title, who]);
        if (!d.rowCount) continue;
        await c.query("INSERT INTO lib_versions (doc_id, version, s3_key, filename, size, pages, has_text, text_extract, uploaded_by, thumb_key) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9)", [d.rows[0].id, stored.key, safeName(file.name), file.bytes.length, info.pages, text.length > 20, text, who, stored.thumb]);
        return { slug, id: d.rows[0].id as number };
      }
      throw new Error("Couldn't find a free web address for that title.");
    });
    await reindex([id]);
    return slug;
  } catch (e) { await dropKeys([stored.key, stored.thumb]); throw e; }
}

/** Adds a new file to a document as its next version. Old versions are kept (staff can open them). A version flagged `reread` asks everyone to acknowledge again; one that isn't carries earlier acknowledgements forward.
 *  The files are stored first (random names), so the row lock is held only for the quick insert. */
export async function addVersion(docId: number, file: Upload, o: { note?: unknown; reread?: unknown }, who: string): Promise<number> {
  const cur = (await (await conn()).query("SELECT v.s3_key FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE d.id = $1 AND d.deleted_at IS NULL", [docId])).rows[0];
  if (!cur) throw new Error("That document doesn't exist.");
  const info = await read(file), stored = await putPdf(cur.s3_key.replace(/\/[^/]+$/, ""), "r" + randomBytes(6).toString("hex"), file.bytes, info.thumb), text = info.text.trim();
  try {
    const version = await withTx(async (c) => {
      await c.query("SELECT 1 FROM lib_docs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [docId]); // two uploads at once take turns
      const n = (await c.query("SELECT max(version) + 1 AS n FROM lib_versions WHERE doc_id = $1", [docId])).rows[0].n as number;
      await c.query("INSERT INTO lib_versions (doc_id, version, s3_key, filename, size, pages, has_text, text_extract, thumb_key, change_note, requires_reread, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [docId, n, stored.key, safeName(file.name), file.bytes.length, info.pages, text.length > 20, text, stored.thumb, typeof o.note === "string" ? o.note.slice(0, 500) : "", o.reread === true, who]);
      await c.query("UPDATE lib_docs SET current_version = $2, updated_at = now() WHERE id = $1", [docId, n]);
      return n;
    });
    await reindex([docId]);
    return version;
  } catch (e) { await dropKeys([stored.key, stored.thumb]); throw e; }
}
