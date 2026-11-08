import { getRobots } from "@/lib/store";
import { db } from "@/lib/db";
import { aiRobots } from "@/lib/aiseo";

export const dynamic = "force-dynamic";

// Public: crawlers fetch this. The text is edited in /webmaster/robots; pages hidden from AI in the page editor add AI-crawler rules below it.
export async function GET() {
  const d = db();
  await d?.ready;
  const hidden = d ? (await d.pool.query("SELECT slug FROM pages WHERE data->'root'->'props'->>'aiExclude' = 'true' ORDER BY slug")).rows.map((r) => r.slug) : [];
  const base = await getRobots();
  return new Response(base.trimEnd() + (hidden.length ? "\n\n" + aiRobots(hidden) : "\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
