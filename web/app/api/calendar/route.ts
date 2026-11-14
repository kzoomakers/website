import { NextResponse } from "next/server";
import { DOWN_MSG, downAWhile, getFeed } from "@/lib/calendar-feed";
import { spend } from "@/lib/limit";

export const dynamic = "force-dynamic";

// Public: the calendar page's events (.ics).
export async function GET() {
  const text = await getFeed();
  if (text) return new NextResponse(text, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=300" } });
  return downAWhile() ? new NextResponse(DOWN_MSG, { status: 503 }) : new NextResponse("calendar unavailable", { status: 502 });
}

// The page's refresh button. POST (not GET) so crawlers and link prefetchers can't trigger it.
export async function POST() {
  // Anyone can press the button, so a global limit keeps it from being used to hammer Google. spend() doesn't count refused tries, so spamming can't keep it locked.
  if (!(await spend("calendar-purge", 6, 60_000)).ok) return new NextResponse("Slow down: the calendar was just refreshed.", { status: 429 });
  return new NextResponse(await getFeed(true) ? "Calendar refreshed." : "Refresh failed: Google's calendar couldn't be reached.", { status: 200 });
}
