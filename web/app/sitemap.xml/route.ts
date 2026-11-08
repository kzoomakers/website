import { siteTree, urlOf } from "@/lib/sitemap";
import { priority } from "@/lib/priority";
import { listPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Generated from the pages table + menu; never edited by hand.
export async function GET() {
  const { entries } = await siteTree();
  const seen = new Set<string>();
  const urls = entries.filter((e) => !seen.has(e.slug) && seen.add(e.slug)).map((e) =>
    `  <url><loc>${esc(urlOf(e.slug))}</loc><lastmod>${e.lastmod.toISOString()}</lastmod><priority>${priority(e.slug, e.depth, e.lastmod, e.created)}</priority></url>`);
  const posts = await listPosts().catch(() => []);
  const blog = [`  <url><loc>${esc(urlOf("blog"))}</loc>${posts[0] ? `<lastmod>${new Date(posts[0].updated_at).toISOString()}</lastmod>` : ""}<priority>${priority("blog", 1, new Date(posts[0]?.updated_at ?? 0), new Date(0))}</priority></url>`,
    ...posts.map((p) => `  <url><loc>${esc(urlOf("blog/" + p.slug))}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod><priority>${priority("post", 1, new Date(p.updated_at), new Date(p.publish_at ?? p.updated_at))}</priority></url>`)];
  urls.push(...blog);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8" } });
}
