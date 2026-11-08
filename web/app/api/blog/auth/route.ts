import { NextResponse } from "next/server";
import { COOKIE_NAME, currentVerified, requestLink, safeNext, setPassword } from "@/lib/readers";
import { baseUrl } from "@/lib/mail";

// GET returns the signed-in reader (or null) so any page can show account state.
export async function GET() {
  const u = await currentVerified().catch(() => null);
  return NextResponse.json(u && { name: u.name }, { headers: { "cache-control": "no-store" } });
}

// POST { email, name?, next? } emails a sign-in/registration link. DELETE signs out.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.email !== "string") return new NextResponse("bad request", { status: 400 });
  try {
    await requestLink(b.email, typeof b.name === "string" ? b.name : "", safeNext(b.next), await baseUrl(req), typeof b.password === "string" ? b.password : "");
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

// PUT { name?, password?, current? } sets or changes the signed-in reader's password (changing an existing one needs `current`).
export async function PUT(req: Request) {
  const [u, b] = await Promise.all([currentVerified().catch(() => null), req.json().catch(() => null)]);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (typeof b?.password !== "string") return new NextResponse("bad request", { status: 400 });
  try {
    await setPassword(u.id, b.password, typeof b.current === "string" ? b.current : "");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}
