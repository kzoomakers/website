import { NextResponse } from "next/server";
import { auth, isAdmin } from "@/auth";
import { currentMember } from "@/lib/readers";
import { FEED_HOST, feedOrigin, getFeedConfig } from "@/feed/config";
import { STATE_OK, mintHandoff, safeReturn } from "@/feed/auth";

export const dynamic = "force-dynamic";

// The main site's half of the community-site login. Someone who is already signed in here (as a member, or as an admin through Google) is sent to the community site with a
// token that says who they are: signed, good for 60 seconds, usable once, and tied to the browser that asked (state) and to the community site (audience).
// Nothing is trusted from the request except the wish itself (role, state, where to land); who the person is comes from their session.
const noStore = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

export async function GET(req: Request) {
  if (!(await getFeedConfig()).enabled) return new NextResponse("not found", { status: 404 });
  if (req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse("forbidden", { status: 403 }); // our own link comes from the same site; a link on someone else's page doesn't
  const q = new URL(req.url).searchParams, role = q.get("role"), state = q.get("state") ?? "", ret = safeReturn(q.get("return"));
  if ((role !== "member" && role !== "admin") || !STATE_OK.test(state)) return new NextResponse("bad request", { status: 400 });
  const me = `/feed-sso?role=${role}&state=${state}&return=${encodeURIComponent(ret)}`;
  const go = (to: string) => NextResponse.redirect(new URL(to, req.url), { status: 302, headers: noStore });

  let email: string | undefined, uid: number | null = null;
  if (role === "admin") {
    const g = (await auth())?.user?.email;
    if (!g) return go(`/admin-login?next=${encodeURIComponent("/admin" + me)}`); // the admin sign-in only returns to /admin paths, see app/admin/feed-sso
    if (!isAdmin(g)) return NextResponse.redirect(`${feedOrigin()}/login?e=not_allowed`, { status: 302, headers: noStore });
    email = g;
  } else {
    const m = await currentMember().catch(() => null);
    if (!m) return go(`/login?next=${encodeURIComponent(me)}`);
    email = m.email; uid = m.id;
  }
  const t = mintHandoff({ email, role, uid, state, ret }, FEED_HOST);
  return NextResponse.redirect(`${feedOrigin()}/login/handoff?t=${t}`, { status: 302, headers: noStore });
}
