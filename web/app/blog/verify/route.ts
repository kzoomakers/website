import { NextResponse } from "next/server";
import { COOKIE_NAME, consumeLink } from "@/lib/readers";
import { baseUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Landing page of the emailed link: spends the token, starts the session, sends the reader back where they were.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const base = await baseUrl(req); // not u.origin: behind Fly's proxy that is http://localhost:3000
  const r = await consumeLink(u.searchParams.get("t") ?? "", base).catch(() => null);
  if (!r) return NextResponse.redirect(new URL("/login?expired=1", base));
  const res = NextResponse.redirect(new URL(r.next, base));
  res.cookies.set(COOKIE_NAME, r.cookie, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https:"), path: "/", maxAge: r.maxAge });
  return res;
}
