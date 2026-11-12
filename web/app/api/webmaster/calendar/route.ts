import { NextResponse } from "next/server";
import { getCalUrl, logAudit, revertSetting, setCalUrl, settingHistory } from "@/lib/store";
import { cachedAt, DOWN_MSG, downAWhile, getFeed, resetFeed } from "@/lib/calendar-feed";
import { actor, editingAllowed } from "@/lib/guard";

// Admin side of the calendar feed (the public feed is /api/calendar, which shares the same cache).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.has("history")) {
    if (!(await editingAllowed("webmaster", "read", "calendar"))) return new NextResponse("not found", { status: 404 });
    return NextResponse.json(await settingHistory("calendar"));
  }
  if (q.has("config")) {
    if (!(await editingAllowed("webmaster", "read", "calendar"))) return new NextResponse("not found", { status: 404 });
    return NextResponse.json({ url: await getCalUrl(), cachedAt: cachedAt() });
  }
  const text = await getFeed();
  if (text) return new NextResponse(text, { headers: { "content-type": "text/calendar; charset=utf-8" } });
  return downAWhile() ? new NextResponse(DOWN_MSG, { status: 503 }) : new NextResponse("calendar unavailable", { status: 502 });
}

export async function PUT(req: Request) {
  if (!(await editingAllowed("webmaster", "write", "calendar"))) return new NextResponse("not found", { status: 404 });
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url.trim())) return new NextResponse("need an http(s) URL", { status: 400 });
  await setCalUrl(url.trim(), await actor());
  resetFeed();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  if (!(await editingAllowed("webmaster", "write", "calendar"))) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  if (revert !== undefined) {
    if (!Number.isInteger(revert) || !(await revertSetting("calendar", revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
    resetFeed();
    return NextResponse.json({ url: await getCalUrl() });
  }
  await getFeed(true); // refresh in place: if Google fails, the old copy stays
  await logAudit(await actor(), "calendar.flush", "refreshed the feed");
  return NextResponse.json({ ok: true });
}
