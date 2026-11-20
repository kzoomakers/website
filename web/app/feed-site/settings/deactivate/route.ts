import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { SESSION_COOKIE, cookieOpts, csrfOk, originOk } from "@/feed/auth";
import { putError } from "@/feed/flash";
import { viewerFor } from "@/feed/identity";
import { deactivate } from "@/feed/models/deactivate";
import { hit } from "@/lib/limit";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// settings#deactivate. Own account only (the id comes from the session); success signs the person out.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  let to = "/settings", out = false;
  try {
    if (!(await hit(`feed:deactivate:${v.id}`, 5, 3_600_000, true))) putError(v.id, "Too many attempts. Please wait a bit.");
    else {
      const r = await deactivate(v.id, { password: String(f.get("password") ?? "").slice(0, 201), sure: f.get("i_am_sure") === "1", disown: f.get("disown") === "1" });
      if (!r.ok) putError(v.id, `${r.error}.`);
      else { out = true; to = "/"; }
    }
  } catch (e) { console.error("feed deactivate:", e); putError(v.id, "Something went wrong. Please try again."); }
  const res = NextResponse.redirect(feedOrigin() + to, { status: 303, headers: H });
  if (out) res.cookies.set(SESSION_COOKIE, "", cookieOpts(0));
  return res;
}
