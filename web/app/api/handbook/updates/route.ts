import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { hit } from "@/lib/limit";
import { handbookSubscribed, setHandbookUpdates } from "@/lib/mail";
import { currentVerified } from "@/lib/readers";

export const dynamic = "force-dynamic";

// The "Notify me by email of updates" button on the handbook. Only for signed-in site accounts (Google admin logins have no reader account, so they get { signedIn: false }).
export async function GET() {
  const u = await currentVerified().catch(() => null);
  return NextResponse.json(u ? { signedIn: true, subscribed: await handbookSubscribed(u.email).catch(() => false) } : { signedIn: false, subscribed: false }, { headers: { "cache-control": "no-store" } });
}

// POST { on: boolean }
export async function POST(req: Request) {
  const [u, b] = await Promise.all([currentVerified().catch(() => null), req.json().catch(() => null)]);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (typeof b?.on !== "boolean") return new NextResponse("bad request", { status: 400 });
  if (!(await hit("hbk:" + u.id, 20, 3600_000))) return new NextResponse("Too many changes. Try again in a little while.", { status: 429 });
  try { await setHandbookUpdates(u.email, u.name, b.on); return NextResponse.json({ subscribed: b.on }); }
  catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
