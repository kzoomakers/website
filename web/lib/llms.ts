import { db } from "./db";
import { urlOf } from "./sitemap";
import { listPosts } from "./blog";
import { listed, pageText, summaryOf, ttl } from "./aiseo";

export type Doc = { url: string; title: string; summary: string; text: string };

// One query for all pages, kept 5 minutes: the llms files are public and crawled, so they must not hit the database per page per request. Edits show up within 5 minutes.
export const llmsDocs = ttl(5 * 60_000, async (): Promise<Doc[]> => {
  const d = db();
  const docs: Doc[] = [];
  if (d) {
    await d.ready;
    for (const r of (await d.pool.query("SELECT slug, data FROM pages ORDER BY slug")).rows) {
      if (r.data?.root?.props?.bare || !listed(r.data)) continue;
      docs.push({ url: urlOf(r.slug), title: String(r.data?.root?.props?.title ?? r.slug), summary: summaryOf(r.data, 160), text: pageText(r.data) });
    }
  }
  for (const p of await listPosts().catch(() => [])) docs.push({ url: urlOf("blog/" + p.slug), title: p.title, summary: p.excerpt, text: p.excerpt + " " + p.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() });
  return docs;
});
