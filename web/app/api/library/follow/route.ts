import { NextResponse } from "next/server";
import { currentMember } from "@/lib/readers";
import { errMsg } from "@/lib/errmsg";
import { setFollow } from "@/lib/library/notify";
import { viewer } from "@/lib/library/viewer";

export const dynamic = "force-dynamic";

// POST { slug, on }: the signed-in member follows (or stops following) an SOP or safety guide they may see; every new version of it is then emailed to them.
export async function POST(req: Request) {
  if (!(await currentMember().catch(() => null))) return new NextResponse("Sign in first.", { status: 401 });
  const b = await req.json().catch(() => null);
  try { await setFollow(await viewer(), String(b?.slug ?? ""), b?.on === true); return NextResponse.json({ ok: true }); } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
