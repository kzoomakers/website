import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { conn } from "./db";
import { listAuthors, listCategories, listPosts, saveAuthor, saveCategory, savePost, slugify } from "./blog";
import { registerMedia } from "./media";
import { s3 } from "./s3";

// Whole-blog backup format ("import.json"): authors, categories, posts and the media files they use (base64), keyed by natural ids
// (author name/email, category slug, post slug, media key) so importing the same file twice updates instead of duplicating.
// Not included: reader accounts and comments.
export type Backup = {
  format: "kzoo-blog"; version: 1; exported_at: string;
  authors: { name: string; email: string; bio?: string; image?: string }[];
  categories: { slug: string; name: string; description?: string }[];
  posts: { slug: string; title: string; excerpt: string; body: string; image: string; tags: string[]; status: "draft" | "published"; publish_at: string | null; author: string; categories: string[] }[];
  media: { key: string; filename: string; mime: string; size: number; alt?: string; data?: string }[];
};


/** `files: false` leaves the image bytes out (small, but a restore then needs the files to already be in storage). */
export async function exportBlog(files = true): Promise<Backup> {
  const [authors, cats, posts, media] = await Promise.all([listAuthors(), listCategories(), listPosts(true), (await conn()).query("SELECT key, filename, mime, size, alt FROM media ORDER BY id")]);
  const store = await s3(), name = new Map(authors.map((a) => [a.id, a.name])), slug = new Map(cats.map((c) => [c.id, c.slug]));
  return {
    format: "kzoo-blog", version: 1, exported_at: new Date().toISOString(),
    authors: authors.map(({ name, email, bio, image }) => ({ name, email, bio, image })),
    categories: cats.map(({ slug, name, description }) => ({ slug, name, description })),
    posts: posts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, body: p.body, image: p.image, tags: p.tags, status: p.status, publish_at: p.publish_at, author: (p.author_id && name.get(p.author_id)) || "", categories: p.category_ids.map((i) => slug.get(i)!).filter(Boolean) })),
    // shortcut: every file is read into memory and base64-encoded in one response; stream or zip it if the library grows past a few hundred MB.
    media: await Promise.all(media.rows.map(async (m) => {
      if (!files || !store) return m;
      const o = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: m.key })).catch(() => null);
      return o ? { ...m, data: Buffer.from(await o.Body!.transformToByteArray()).toString("base64") } : m;
    })),
  };
}

/** Adds or updates everything in the backup. Nothing is deleted. */
export async function importBlog(b: Backup, who: string) {
  if (b?.format !== "kzoo-blog" || b.version !== 1 || !Array.isArray(b.posts)) throw new Error("This isn't a Kzoo Makers blog backup (import.json).");
  const r = { posts: 0, created: 0, updated: 0, authors: 0, categories: 0, media: 0, mediaSkipped: 0, errors: [] as string[] };
  const store = await s3(), c = await conn();
  for (const m of b.media ?? []) {
    if (!m.data) continue;
    if (!store || !/^[\w\-\/.]+$/.test(m.key) || m.key.includes("..")) { r.mediaSkipped++; continue; }
    const body = Buffer.from(m.data, "base64");
    await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: m.key, Body: body, ContentType: m.mime }));
    await registerMedia(m.key, m.filename, m.mime, body.length, who);
    if (m.alt) await c.query("UPDATE media SET alt = $2 WHERE key = $1", [m.key, m.alt]);
    r.media++;
  }
  const authors = new Map((await listAuthors()).map((a) => [a.name.toLowerCase(), a]));
  for (const a of b.authors ?? []) {
    const have = authors.get(a.name.toLowerCase());
    authors.set(a.name.toLowerCase(), have ?? (r.authors++, await saveAuthor(a, who)));
  }
  const cats = new Map((await listCategories()).map((x) => [x.slug, x]));
  for (const x of b.categories ?? []) {
    const slug = slugify(x.slug || x.name);
    if (!cats.has(slug)) { cats.set(slug, await saveCategory({ ...x, slug }, who)); r.categories++; }
  }
  const existing = new Map((await listPosts(true)).map((p) => [p.slug, p.id]));
  for (const p of b.posts) {
    try {
      const slug = slugify(p.slug || p.title), id = existing.get(slug);
      await savePost({ id, slug, title: p.title, excerpt: p.excerpt ?? "", body: p.body ?? "", image: p.image ?? "", tags: p.tags ?? [], status: p.status === "published" ? "published" : "draft",
        publish_at: p.publish_at, author_id: authors.get((p.author ?? "").toLowerCase())?.id ?? null, category_ids: (p.categories ?? []).map((s) => cats.get(s)?.id).filter((i): i is number => !!i) }, who, "post.import");
      r.posts++; id ? r.updated++ : r.created++;
    } catch (e: any) { r.errors.push(`${p.title}: ${e.message}`); }
  }
  return r;
}
