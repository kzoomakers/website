import { NextResponse } from "next/server";
import { feedOrigin } from "./config";
import { csrfOk, originOk } from "./auth";
import { viewerFor, type Viewer } from "./identity";
import { putError } from "./flash";

const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

/** The shared shell of a signed-in form POST: same-origin, a signed-in user with a valid csrf token, then `run` returns the path to send them to (303). A thrown error shows a generic message on /tags. */
export async function formPost(req: Request, run: (v: Viewer, f: FormData) => Promise<string>) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  let to = "/tags";
  try { to = await run(v, f); } catch (e) { console.error("feed form:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(feedOrigin() + to, { status: 303, headers: H });
}
