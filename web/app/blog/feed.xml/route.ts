import { listPosts } from "@/lib/blog";
import { SITE } from "@/lib/sitemap";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function GET() {
  const items = (await listPosts()).slice(0, 30).map((p) =>
    `<item><title>${esc(p.title)}</title><link>${SITE}/blog/${p.slug}</link><guid>${SITE}/blog/${p.slug}</guid><pubDate>${new Date(p.publish_at ?? p.updated_at).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Kzoo Makers Blog</title><link>${SITE}/blog</link><description>News from the Kalamazoo Makerspace</description>${items.join("")}</channel></rss>`,
    { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
