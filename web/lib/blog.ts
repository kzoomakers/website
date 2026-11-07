import { db } from "./db";
import { logAudit } from "./store";

export type Cat = { id: number; slug: string; name: string; description: string };
export type Author = { id: number; name: string; email: string; bio: string; image: string };
export type Post = { id: number; slug: string; title: string; excerpt: string; body: string; image: string; tags: string[]; status: "draft" | "published"; publish_at: string | null; author: string; updated_at: string;
  author_id: number | null; author_name: string | null; category_ids: number[]; categories: { slug: string; name: string }[] };
export type PostInput = Omit<Post, "id" | "author" | "updated_at" | "author_name" | "categories"> & { id?: number };

const COLS = `id, slug, title, excerpt, body, image, tags, status, publish_at, author, updated_at, author_id, category_ids,
  (SELECT name FROM authors a WHERE a.id = author_id) AS author_name,
  (SELECT COALESCE(json_agg(json_build_object('slug', c.slug, 'name', c.name) ORDER BY c.name), '[]') FROM categories c WHERE c.id = ANY(category_ids)) AS categories`;
// Live = published and its (optional) scheduled time has passed.
const LIVE = "status = 'published' AND (publish_at IS NULL OR publish_at <= now())";
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

export type PostFilter = { limit?: number; light?: boolean; all?: boolean; tag?: string; category?: string; author?: number; q?: string };

// shortcut: full-text search scans every post (no index); add a GIN index on the tsvector if the blog reaches thousands of posts.
export async function listPosts(f: PostFilter | boolean = {}): Promise<Post[]> {
  if (!db()) return [];
  const o = typeof f === "boolean" ? { all: f } : f, args: unknown[] = [], where: string[] = o.all ? [] : [LIVE];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("$", "$" + args.length)); };
  if (o.tag) add("$ = ANY(tags)", o.tag);
  if (o.category) add("category_ids && ARRAY(SELECT id FROM categories WHERE slug = $)", o.category);
  if (o.author) add("author_id = $", o.author);
  if (o.q) add("to_tsvector('english', title || ' ' || excerpt || ' ' || body || ' ' || array_to_string(tags, ' ')) @@ plainto_tsquery('english', $)", o.q);
  // light: list pages only show the excerpt, so skip the (large) body text.
  const cols = o.light ? COLS.replace(" body,", " '' AS body,") : COLS;
  return (await (await conn()).query(`SELECT ${cols} FROM posts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY COALESCE(publish_at, updated_at) DESC${o.limit ? " LIMIT " + Math.floor(o.limit) : ""}`, args)).rows;
}

export async function getPost(key: string | number, all = false): Promise<Post | null> {
  if (!db()) return null;
  const col = typeof key === "number" ? "id" : "slug";
  return (await (await conn()).query(`SELECT ${COLS} FROM posts WHERE ${col} = $1 ${all ? "" : "AND " + LIVE}`, [key])).rows[0] ?? null;
}

/** Create (no id) or update. Throws on a bad/duplicate slug. */
export async function savePost(p: PostInput, who: string, action = "post.save", target = ""): Promise<Post> {
  const slug = slugify(p.slug || p.title);
  if (!slug || !p.title.trim()) throw new Error("title required");
  const v = [slug, p.title.trim(), p.excerpt, p.body, p.image, p.tags, p.status, p.publish_at || null, p.author_id || null, p.category_ids];
  const c = await conn();
  const r = p.id
    ? await c.query(`UPDATE posts SET slug=$1, title=$2, excerpt=$3, body=$4, image=$5, tags=$6, status=$7, publish_at=$8, author_id=$9, category_ids=$10, updated_at=now() WHERE id=$11 RETURNING ${COLS}`, [...v, p.id])
    : await c.query(`INSERT INTO posts (slug, title, excerpt, body, image, tags, status, publish_at, author_id, category_ids, author) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLS}`, [...v, who]);
  if (!r.rows[0]) throw new Error("no such post");
  await logAudit(who, action, `${r.rows[0].id}${target ? " " + target : ""}`, r.rows[0]);
  return r.rows[0];
}

export async function deletePost(id: number, who: string) {
  const r = await (await conn()).query("DELETE FROM posts WHERE id = $1 RETURNING slug", [id]);
  if (r.rows[0]) await logAudit(who, "post.delete", `${id} ${r.rows[0].slug}`);
}

/** Snapshots (audit rows) of one post, newest first. */
export async function postHistory(id: number) {
  return (await (await conn()).query(
    "SELECT id, at, actor, action, target, data FROM audit WHERE data IS NOT NULL AND action LIKE 'post.%' AND (target = $1 OR target LIKE $1 || ' %') ORDER BY id DESC LIMIT 100", [String(id)])).rows;
}

export async function revertPost(id: number, rev: number, who: string) {
  const r = await (await conn()).query("SELECT data FROM audit WHERE id = $1 AND action LIKE 'post.%' AND data IS NOT NULL AND (target = $2 OR target LIKE $2 || ' %')", [rev, String(id)]);
  return r.rows[0] ? savePost({ ...r.rows[0].data, id }, who, "post.revert", `revision #${rev}`) : null;
}

// ---- authors and categories (small lookup tables, same shape of CRUD)
export const listAuthors = async (): Promise<Author[]> => (db() ? (await (await conn()).query("SELECT * FROM authors ORDER BY name")).rows : []);
export const listCategories = async (): Promise<Cat[]> => (db() ? (await (await conn()).query("SELECT * FROM categories ORDER BY name")).rows : []);
export const getAuthor = async (id: number): Promise<Author | null> => (db() ? (await (await conn()).query("SELECT * FROM authors WHERE id = $1", [id])).rows[0] ?? null : null);

export async function saveAuthor(a: Partial<Author>, who: string) {
  if (!a.name?.trim()) throw new Error("name required");
  const v = [a.name.trim(), a.email ?? "", a.bio ?? "", a.image ?? ""], c = await conn();
  const r = a.id ? await c.query("UPDATE authors SET name=$1, email=$2, bio=$3, image=$4 WHERE id=$5 RETURNING *", [...v, a.id]) : await c.query("INSERT INTO authors (name, email, bio, image) VALUES ($1,$2,$3,$4) RETURNING *", v);
  await logAudit(who, "author.save", r.rows[0].name);
  return r.rows[0] as Author;
}
export async function saveCategory(x: Partial<Cat>, who: string) {
  const slug = slugify(x.slug || x.name || "");
  if (!slug || !x.name?.trim()) throw new Error("name required");
  const v = [slug, x.name.trim(), x.description ?? ""], c = await conn();
  const r = x.id ? await c.query("UPDATE categories SET slug=$1, name=$2, description=$3 WHERE id=$4 RETURNING *", [...v, x.id]) : await c.query("INSERT INTO categories (slug, name, description) VALUES ($1,$2,$3) RETURNING *", v);
  await logAudit(who, "category.save", r.rows[0].name);
  return r.rows[0] as Cat;
}
export async function deleteLookup(kind: "author" | "category", id: number, who: string) {
  const c = await conn();
  // Posts keep existing; they just lose the link.
  if (kind === "author") { await c.query("UPDATE posts SET author_id = NULL WHERE author_id = $1", [id]); await c.query("DELETE FROM authors WHERE id = $1", [id]); }
  else { await c.query("UPDATE posts SET category_ids = array_remove(category_ids, $1)", [id]); await c.query("DELETE FROM categories WHERE id = $1", [id]); }
  await logAudit(who, `${kind}.delete`, String(id));
}

/** The author row for a signed-in admin's email, created on first use so every editor can be credited. */
export async function authorForEmail(email: string): Promise<Author> {
  const c = await conn();
  const r = await c.query("SELECT * FROM authors WHERE lower(email) = lower($1) LIMIT 1", [email]);
  return r.rows[0] ?? (await c.query("INSERT INTO authors (name, email) VALUES ($1, $2) RETURNING *", [email.split("@")[0], email])).rows[0];
}
