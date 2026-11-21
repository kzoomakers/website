import type { PoolClient } from "pg";
import { conn } from "../db";

// tsv weights: title and tags outrank the description, which outranks the text pulled from the PDF.
const TSV = `setweight(to_tsvector('english', d.title), 'A') || setweight(to_tsvector('english', coalesce((SELECT string_agg(t.name, ' ') FROM lib_doc_tags x JOIN lib_tags t ON t.id = x.tag_id WHERE x.doc_id = d.id), '')), 'A') || setweight(to_tsvector('english', d.description), 'B') || setweight(to_tsvector('english', left(coalesce((SELECT text_extract FROM lib_versions v WHERE v.doc_id = d.id AND v.version = d.current_version), ''), 500000)), 'C')`;
/** Rebuilds the search text of these documents. Only needed when the title, description, tags or file changed. */
export async function reindex(ids: number[], c?: PoolClient) {
  if (ids.length) await (c ?? (await conn())).query(`UPDATE lib_docs d SET tsv = ${TSV} WHERE d.id = ANY($1)`, [ids]);
}
