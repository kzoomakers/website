import { getRobots } from "@/lib/store";

export const dynamic = "force-dynamic";

// Public: crawlers fetch this. The text is edited in /webmaster/robots.
export async function GET() {
  return new Response(await getRobots(), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
