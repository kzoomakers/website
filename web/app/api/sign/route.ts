import { NextResponse } from "next/server";
import { baseUrl } from "@/lib/mail";
import { clientIp, hashIp } from "@/lib/comments";
import { hit } from "@/lib/limit";
import { db } from "@/lib/db";
import { byToken, cookieOf, declineByToken, sendCode, signByToken, startPublic, unlock, unlockCookie, unlocked } from "@/lib/sign";

export const dynamic = "force-dynamic";

// POST { action, token, ... }: public, authorised by the emailed one-time token (plus the signer's password / emailed code when the sender asked for one).
// actions: sign | decline | code (email me a code) | unlock { password, code } | direct { token = a template's public token, name, email }. Throttled per address.
export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a || typeof a.token !== "string" || !db()) return new NextResponse("bad request", { status: 400 });
  if (!hit(hashIp(req) + (a.action === "direct" ? ":d" : ""), a.action === "direct" ? 5 : 20, 600_000)) return new NextResponse("Too many attempts. Try again in a few minutes.", { status: 429 });
  try {
    const proof = { ip: clientIp(req), ua: req.headers.get("user-agent") ?? "" }, str = (v: unknown) => String(v ?? "");
    if (a.action === "direct") return NextResponse.json({ token: await startPublic(a.token, str(a.name), str(a.email), await baseUrl(req)) });
    if (a.action === "code") await sendCode(a.token);
    else if (a.action === "unlock") {
      const res = NextResponse.json({ ok: true }), c = unlockCookie(await unlock(a.token, str(a.password), str(a.code)));
      res.cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: c.maxAge });
      return res;
    } else if (a.action === "decline") await declineByToken(a.token, str(a.reason));
    else {
      const f = await byToken(a.token);
      await signByToken(a.token, { signature: str(a.signature), drawn: str(a.drawn), initials: str(a.initials), values: a.values && typeof a.values === "object" ? a.values : {} }, proof, await baseUrl(req), !!f && unlocked(f.signer.id, cookieOf(req, "su" + f.signer.id)));
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
