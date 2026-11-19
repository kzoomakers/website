import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putFlash } from "@/feed/flash";
import { createStory, type Submission } from "@/feed/models/submit";
import { hit } from "@/lib/limit";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const to = (path: string) => NextResponse.redirect(feedOrigin() + path, { status: 303, headers: H });

export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie), str = (k: string, max: number) => { const x = f.get(k); return typeof x === "string" ? x.slice(0, max) : ""; };
  if (!v || !v.username || !csrfOk(cookie, str("csrf", 100))) return new NextResponse("forbidden", { status: 403 });
  const input: Submission = { title: str("title", 400), url: str("url", 400), description: str("description", 70_000), tags: f.getAll("tags").filter((t): t is string => typeof t === "string").slice(0, 20).map((t) => t.slice(0, 40)), userIsAuthor: f.get("user_is_author") === "on" };
  // Lobsters' own limits are per-story speed limits; this is a flat cap against floods (shortcut: tune once real traffic shows what's normal).
  if (!(await hit(`feed:story:${v.id}`, 10, 3_600_000, true))) { putFlash(v.id, { input, errors: ["You're submitting too fast. Please wait a bit."] }); return to("/stories/new"); }
  try {
    const r = await createStory(v, input);
    if (r.ok) return to(`/s/${r.shortId}`);
    putFlash(v.id, { input, errors: r.errors, similar: r.similar });
  } catch (e) { console.error("feed submit:", e); putFlash(v.id, { input, errors: ["Something went wrong. Please try again."] }); }
  return to("/stories/new");
}
