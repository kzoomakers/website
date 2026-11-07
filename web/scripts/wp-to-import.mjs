// One-off: turns a WordPress posts dump + the referenced upload files into data/import.json (the blog backup format, see lib/blog-io.ts).
// usage: node scripts/wp-to-import.mjs posts.ndjson uploads-dir [out.json]
//   posts.ndjson: one JSON object per line {id,slug,title,excerpt,body,status,date,modified,author,author_email,image,categories:[{slug,name}],tags:[]}
//   uploads-dir: the wp-content/uploads tree holding every file the posts reference
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const [, , src, dir, out = "data/import.json"] = process.argv;
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml" };
const ent = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const media = new Map(); // key -> entry

/** Pulls a referenced upload into the media list and returns its new /uploads/ URL (or the original URL if the file is missing). */
function take(url, alt = "") {
  const rel = decodeURIComponent(url.replace(/^.*wp-content\/uploads\//, "")), file = path.join(dir, rel);
  if (!existsSync(file)) { console.warn("missing file:", rel); return url; }
  const base = path.basename(rel), ext = base.split(".").pop().toLowerCase(), key = "blog-import/" + base.replace(/[^\w.\-]/g, "_");
  if (!media.has(key)) { const buf = readFileSync(file); media.set(key, { key, filename: base, mime: MIME[ext] ?? "application/octet-stream", size: buf.length, alt, data: buf.toString("base64") }); }
  return "/uploads/" + key;
}

const clean = (html) => html
  .replace(/<!--\s*\/?wp:[\s\S]*?-->\s*/g, "")                                  // block editor markers
  .replace(/\s+(srcset|sizes)="[^"]*"/g, "")                                    // pointed at resized copies we don't carry
  .replace(/(<img\b[^>]*?\bsrc=)"([^"]*wp-content\/uploads[^"]*)"([^>]*)>/g, (m, a, u, rest) => `${a}"${take(u, (rest.match(/\balt="([^"]*)"/) ?? [])[1] ?? "")}"${rest}>`)
  .replace(/(\bhref=)"([^"]*wp-content\/uploads[^"]*)"/g, (m, a, u) => `${a}"${take(u)}"`)
  .replace(/\n{3,}/g, "\n\n").trim();

const rows = readFileSync(src, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const authors = new Map(), cats = new Map();
const posts = rows.map((r) => {
  const body = clean(r.body), when = /^0000/.test(r.date) ? null : new Date(r.date.replace(" ", "T").replace(/\.0+$/, "") + "Z").toISOString();
  authors.set(r.author, { name: r.author, email: r.author_email });
  const cs = r.categories.filter((c) => c.slug !== "uncategorized").map((c) => ({ slug: c.slug, name: ent(c.name) }));
  cs.forEach((c) => cats.set(c.slug, { slug: c.slug, name: c.name, description: "" }));
  return {
    slug: r.slug || slugify(r.title), title: ent(r.title), excerpt: r.excerpt || ent(body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 200),
    body, image: r.image ? take(r.image) : "", tags: r.tags, status: r.status === "publish" || r.status === "future" ? "published" : "draft",
    publish_at: when, author: r.author, categories: cs.map((c) => c.slug), updated_at: r.modified.startsWith("0000") ? null : new Date(r.modified.replace(" ", "T").replace(/\.0+$/, "") + "Z").toISOString(),
  };
});
writeFileSync(out, JSON.stringify({ format: "kzoo-blog", version: 1, exported_at: new Date().toISOString(), authors: [...authors.values()], categories: [...cats.values()], posts, media: [...media.values()] }));
console.log(`${posts.length} posts, ${authors.size} authors, ${cats.size} categories, ${media.size} media files -> ${out}`);
