import { sitemapXml } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

// Generated from the pages table + menu and cached in memory (lib/sitemap.ts): built at startup, rebuilt every 2.5 hours.
export async function GET() {
  return new Response(await sitemapXml(), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
