import { NextResponse } from "next/server";
import { currentMember } from "@/lib/readers";
import { errMsg } from "@/lib/errmsg";
import { acknowledge } from "@/lib/library/docs";
import { viewer } from "@/lib/library/viewer";

export const dynamic = "force-dynamic";

// POST { slug }: the signed-in member says they read the current version of an SOP or safety guide.
export async function POST(req: Request) {
  if (!(await currentMember().catch(() => null))) return new NextResponse("Sign in first.", { status: 401 });
  const b = await req.json().catch(() => null);
  try { await acknowledge(await viewer(), String(b?.slug ?? "")); return NextResponse.json({ ok: true }); } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
