import { NextResponse } from "next/server";
import { hit, tooBig } from "@/lib/limit";
import { currentMember } from "@/lib/readers";
import { errMsg } from "@/lib/errmsg";
import { setFollow } from "@/lib/library/notify";
import { viewer } from "@/lib/library/viewer";

export const dynamic = "force-dynamic";

// POST { slug, on }: the signed-in member follows (or stops following) an SOP or safety guide they may see; every new version of it is then emailed to them.
export async function POST(req: Request) {
  if (tooBig(req, 0.01)) return new NextResponse("too large", { status: 413 });
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!(await hit(`libfollow:${u.id}`, 30, 600_000))) return new NextResponse("Slow down a little.", { status: 429 });
  const b = await req.json().catch(() => null);
  try { await setFollow(await viewer(), String(b?.slug ?? ""), b?.on === true); return NextResponse.json({ ok: true }); } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
