import { NextResponse } from "next/server";
import { COOKIE_NAME, currentReader, requestLink, safeNext } from "@/lib/readers";
import { baseUrl } from "@/lib/mail";

// GET returns the signed-in reader (or null) so any page can show account state.
export async function GET() {
  const u = await currentReader().catch(() => null);
  return NextResponse.json(u && { name: u.name }, { headers: { "cache-control": "no-store" } });
}

// POST { email, name?, next? } emails a sign-in/registration link. DELETE signs out.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.email !== "string") return new NextResponse("bad request", { status: 400 });
  try {
    await requestLink(b.email, typeof b.name === "string" ? b.name : "", safeNext(b.next), await baseUrl(req));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
