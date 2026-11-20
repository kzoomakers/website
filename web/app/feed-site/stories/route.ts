import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putFlash } from "@/feed/flash";
import { createStory } from "@/feed/models/submit";
import { readSubmission } from "./form";
import { hit } from "@/lib/limit";
import { dropStoryImage, storeStoryImage } from "@/feed/models/story-image";
import { imageFail, uploadGate } from "@/lib/image";

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
  const input = readSubmission(f);
  // Lobsters' own limits are per-story speed limits; this is a flat cap against floods (shortcut: tune once real traffic shows what's normal).
  if (!(await hit(`feed:story:${v.id}`, 10, 3_600_000, true))) { putFlash(v.id, { input, errors: ["You're submitting too fast. Please wait a bit."] }); return to("/stories/new"); }
  const file = f.get("image");
  let image = "";
  try {
    if (file instanceof File && file.size > 0 && input.tags.some((t) => t.toLowerCase() === "images")) { // a picture only counts with the images tag (createStory checks again)
      const no = await uploadGate(req, `feed:${v.id}`, 10);
      if (no) { putFlash(v.id, { input, errors: [await no.text()] }); return to("/stories/new"); }
      try { image = await storeStoryImage(file); } catch (e) { putFlash(v.id, { input, errors: [await imageFail(e).text()] }); return to("/stories/new"); }
    }
    const r = await createStory(v, { ...input, image: image || undefined });
    if (r.ok) return to(`/s/${r.shortId}`);
    if (image) await dropStoryImage(image);
    putFlash(v.id, { input, errors: r.errors, similar: r.similar });
  } catch (e) { if (image) await dropStoryImage(image); console.error("feed submit:", e); putFlash(v.id, { input, errors: ["Something went wrong. Please try again."] }); }
  return to("/stories/new");
}
