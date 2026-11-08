import { NextResponse } from "next/server";
import { getFeed } from "@/lib/calendar-feed";
import { hit } from "@/lib/limit";

export const dynamic = "force-dynamic";

// Public: the calendar page's events (.ics), and "?purge" for its refresh button.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.has("purge")) {
    // Anyone can press the button, so a global limit keeps it from being used to hammer Google.
    if (!hit("calendar-purge", 6, 60_000)) return new NextResponse("Slow down: the calendar was just refreshed.", { status: 429 });
    return new NextResponse(await getFeed(true) ? "Calendar refreshed." : "Refresh failed: Google's calendar couldn't be reached.", { status: 200 });
  }
  const text = await getFeed();
  return text ? new NextResponse(text, { headers: { "content-type": "text/calendar; charset=utf-8" } }) : new NextResponse("calendar unavailable", { status: 502 });
}
