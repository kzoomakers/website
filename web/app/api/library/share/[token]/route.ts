import { NextResponse } from "next/server";
import { hit } from "@/lib/limit";
import { passcodeOk, shareByToken, unlockValue } from "@/lib/library/shares";

export const dynamic = "force-dynamic";

// POST form "passcode": checks it and sets the unlock cookie for this link, then returns to the link's page. Wrong guesses are rate limited per link.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, s = await shareByToken(token), back = new URL(`/d/${token}`, req.url);
  if (!s) return new NextResponse("not found", { status: 404 });
  if (!(await hit(`libshare:${s.id}`, 10, 600_000, true))) return new NextResponse("Too many tries. Wait a few minutes.", { status: 429 });
  const pass = String((await req.formData().catch(() => null))?.get("passcode") ?? "");
  if (!passcodeOk(s, pass)) { back.searchParams.set("bad", "1"); return NextResponse.redirect(back, 303); }
  const res = NextResponse.redirect(back, 303);
  res.cookies.set("ls_" + s.id, unlockValue(s), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 6 * 3600 });
  return res;
}
