import { NextResponse } from "next/server";
import { COOKIE_NAME, afterSignIn, passwordLogin, safeNext } from "@/lib/readers";

export const dynamic = "force-dynamic";

// POST { email, password } signs in with a password and starts the same session an emailed link does.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.email !== "string" || typeof b?.password !== "string") return new NextResponse("bad request", { status: 400 });
  try {
    const s = await passwordLogin(b.email, b.password);
    const res = NextResponse.json({ ok: true, next: await afterSignIn(s.userId, safeNext(b.next)) });
    res.cookies.set(COOKIE_NAME, s.cookie, { httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:", path: "/", maxAge: s.maxAge });
    return res;
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}
