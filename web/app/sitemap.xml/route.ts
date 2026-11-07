import { siteTree, urlOf } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// Depth in the menu hierarchy sets priority: home 1.0, top level 0.8, nested 0.6, unlisted 0.4.
const prio = (slug: string, depth: number) => (slug === "index" ? "1.0" : depth === 0 ? "0.8" : depth === 1 ? "0.6" : "0.4");

// Generated from the pages table + menu; never edited by hand.
export async function GET() {
  const { entries } = await siteTree();
  const seen = new Set<string>();
  const urls = entries.filter((e) => !seen.has(e.slug) && seen.add(e.slug)).map((e) =>
    `  <url><loc>${esc(urlOf(e.slug))}</loc><lastmod>${e.lastmod.toISOString()}</lastmod><priority>${prio(e.slug, e.depth)}</priority></url>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8" } });
}
