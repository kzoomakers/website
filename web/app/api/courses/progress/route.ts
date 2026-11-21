import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { learnFlags } from "@/lib/learn-flags";
import { recordProgress } from "@/lib/courses/player";
import { currentMember } from "@/lib/readers";

export const dynamic = "force-dynamic";

// POST { lesson, action: "view" | "done" | "video" | "tick", block?, idx?, on? }: the signed-in member's progress on a lesson they may open. Staff previews never call this.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!(await learnFlags()).courses) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null), lesson = Number(b?.lesson);
  if (!Number.isInteger(lesson)) return new NextResponse("bad lesson", { status: 400 });
  try { return NextResponse.json(await recordProgress(u.id, lesson, { action: b.action, block: String(b.block ?? ""), idx: Number(b.idx), on: b.on === true } as any)); }
  catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
