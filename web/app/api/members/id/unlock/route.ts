import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { baseUrl } from "@/lib/mail";
import { UNLOCK_COOKIE, UNLOCK_SECS, confirmPassword, currentMember, emailUnlock, spendUnlock, unlockValue } from "@/lib/readers";

export const dynamic = "force-dynamic";

const grant = (res: NextResponse, id: number, secure: boolean) => { res.cookies.set(UNLOCK_COOKIE, unlockValue(id), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: UNLOCK_SECS }); return res; };

// POST { password } unlocks with the password; POST { mail: true } emails a one-time link instead.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  const a = await req.json().catch(() => ({}));
  try {
    const base = await baseUrl(req);
    if (a.mail) { await emailUnlock(u, base); return NextResponse.json({ ok: true }); }
    if (!(await confirmPassword(u.id, String(a.password ?? "")))) return new NextResponse("That password isn't right.", { status: 403 });
    return grant(NextResponse.json({ ok: true }), u.id, base.startsWith("https:"));
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}

// GET ?t=<token>: the emailed link. Must be opened signed in as the same member.
export async function GET(req: Request) {
  const base = await baseUrl(req), t = new URL(req.url).searchParams.get("t") ?? "";
  const u = await currentMember().catch(() => null);
  if (!u) return NextResponse.redirect(new URL("/login?next=" + encodeURIComponent("/api/members/id/unlock?t=" + t), base));
  const ok = t.length === 64 && (await spendUnlock(u.id, t).catch(() => false));
  const res = NextResponse.redirect(new URL("/members/id", base));
  return ok ? grant(res, u.id, base.startsWith("https:")) : res;
}
