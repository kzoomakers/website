import { conn } from "../db";
import { slugify, visibleSql, type Viewer } from "./rules";

export type Folder = { id: number; parent_id: number | null; title: string; slug: string; n: number };
export const MAX_DEPTH = 3;

/** Folders the viewer can use, with how many documents they may see in each (own folder only). Non-staff don't see empty folders, so a folder name never hints at a staff-only document. */
export async function listFolders(v: Viewer): Promise<Folder[]> {
  const r = await (await conn()).query(`SELECT f.id, f.parent_id, f.title, f.slug, (SELECT count(*)::int FROM lib_placements p JOIN lib_docs d ON d.id = p.doc_id WHERE p.folder_id = f.id AND ${visibleSql(v, "$1")}) AS n FROM lib_folders f ORDER BY f.position, lower(f.title)`, [v.id]);
  const rows: Folder[] = r.rows;
  return v.staff ? rows : rows.filter((f) => withDescendants(rows, f.id).some((id) => rows.find((x) => x.id === id)!.n > 0));
}

const depth = async (c: Awaited<ReturnType<typeof conn>>, id: number | null) => {
  let d = 0;
  for (let cur = id; cur !== null && d < 10; d++) cur = (await c.query("SELECT parent_id FROM lib_folders WHERE id = $1", [cur])).rows[0]?.parent_id ?? null;
  return d;
};

export async function createFolder(parent: number | null, title: string) {
  const c = await conn(), t = title.trim().slice(0, 80);
  if (!t) throw new Error("Give the folder a name.");
  if (parent !== null && !(await c.query("SELECT 1 FROM lib_folders WHERE id = $1", [parent])).rowCount) throw new Error("That parent folder doesn't exist.");
  if ((await depth(c, parent)) >= MAX_DEPTH) throw new Error(`Folders can only go ${MAX_DEPTH} levels deep.`);
  const pos = (await c.query("SELECT coalesce(max(position), 0) + 1 AS p FROM lib_folders WHERE parent_id IS NOT DISTINCT FROM $1", [parent])).rows[0].p;
  await c.query("INSERT INTO lib_folders (parent_id, title, slug, position) VALUES ($1, $2, $3, $4)", [parent, t, slugify(t), pos]);
}
export async function renameFolder(id: number, title: string) {
  const t = title.trim().slice(0, 80);
  if (!t) throw new Error("Give the folder a name.");
  await (await conn()).query("UPDATE lib_folders SET title = $2, slug = $3 WHERE id = $1", [id, t, slugify(t)]);
}
/** Removes a folder and its sub-folders; the documents in it stay in the library. */
export const deleteFolder = async (id: number) => { await (await conn()).query("DELETE FROM lib_folders WHERE id = $1", [id]); };

/** Puts a document in exactly these folders (an empty list takes it out of every folder). */
export async function placeDoc(docId: number, folderIds: number[]) {
  const c = await conn(), ids = [...new Set(folderIds.filter(Number.isInteger))].slice(0, 10);
  await c.query("DELETE FROM lib_placements WHERE doc_id = $1", [docId]);
  if (ids.length) await c.query("INSERT INTO lib_placements (doc_id, folder_id, position) SELECT $1, f.id, 0 FROM lib_folders f WHERE f.id = ANY($2) ON CONFLICT DO NOTHING", [docId, ids]);
}

/** The folder and everything below it, so browsing a folder shows its sub-folders' documents too. */
export const withDescendants = (all: { id: number; parent_id: number | null }[], id: number): number[] => [id, ...all.filter((f) => f.parent_id === id).flatMap((f) => withDescendants(all, f.id))];
