import { NextResponse } from "next/server";
import { getCalUrl, logAudit, revertSetting, setCalUrl, settingHistory } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

// shortcut: per-process cache, fine for one instance; use a shared cache if the app is ever scaled out.
let cache: { text: string; at: number } | null = null;
const TTL = 60 * 60 * 1000;

// Public: the calendar page loads its events from here instead of straight from the remote feed.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.has("history")) {
    if (!(await editingAllowed("webmaster", "read"))) return new NextResponse("not found", { status: 404 });
    return NextResponse.json(await settingHistory("calendar"));
  }
  if (q.has("config")) {
    if (!(await editingAllowed("webmaster", "read"))) return new NextResponse("not found", { status: 404 });
    return NextResponse.json({ url: await getCalUrl(), cachedAt: cache?.at ?? null });
  }
  if (!cache || Date.now() - cache.at > TTL) {
    const r = await fetch(await getCalUrl(), { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return new NextResponse("calendar unavailable", { status: 502 });
    cache = { text: await r.text(), at: Date.now() };
  }
  return new NextResponse(cache.text, { headers: { "content-type": "text/calendar; charset=utf-8" } });
}

export async function PUT(req: Request) {
  if (!(await editingAllowed("webmaster"))) return new NextResponse("not found", { status: 404 });
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url.trim())) return new NextResponse("need an http(s) URL", { status: 400 });
  await setCalUrl(url.trim(), await actor());
  cache = null;
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  if (!(await editingAllowed("webmaster"))) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  if (revert !== undefined) {
    if (!Number.isInteger(revert) || !(await revertSetting("calendar", revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
    cache = null;
    return NextResponse.json({ url: await getCalUrl() });
  }
  cache = null;
  await logAudit(await actor(), "calendar.flush", "flushed cache");
  return NextResponse.json({ ok: true });
}
