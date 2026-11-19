import { NextResponse } from "next/server";
import { FEED_HOST, feedOrigin } from "@/feed/config";
import { SESSION_DAYS, SESSION_COOKIE, cookieOpts, verifyHandoff } from "@/feed/auth";
import { Refused, consumeHandoff, loginFromHandoff, viewerFor } from "@/feed/identity";

export const dynamic = "force-dynamic";

// Where the main site sends someone with a login token. The token is checked, used up and replaced by this site's own cookie in one step, then the visitor is redirected so it never stays in the address bar or history.
export async function GET(req: Request) {
  const h = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  const go = (path: string) => { const r = NextResponse.redirect(feedOrigin() + path, { status: 302, headers: h }); r.cookies.set("feed_hs", "", { ...cookieOpts(0), path: "/login/handoff" }); return r; };
  const t = new URL(req.url).searchParams.get("t") ?? "", state = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_hs=([\w-]{1,64})/)?.[1] ?? "";
  try {
    const claims = await verifyHandoff(t, { aud: FEED_HOST, state, consume: consumeHandoff });
    if (!claims) return go("/login?e=handoff"); // forged, expired, used before, or for another browser: all look the same
    const session = await loginFromHandoff(claims);
    const first = !(await viewerFor(session))?.username; // new here: pick a username before anything else
    const res = go(first ? `/login/username?return=${encodeURIComponent(claims.ret)}` : claims.ret);
    res.cookies.set(SESSION_COOKIE, session, cookieOpts(SESSION_DAYS * 86400));
    return res;
  } catch (e) {
    if (e instanceof Refused) return go(`/login?e=${e.code}`);
    console.error("feed handoff:", e);
    return go("/login?e=error");
  }
}
