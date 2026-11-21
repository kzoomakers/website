import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { learnFlags } from "@/lib/learn-flags";
import { practiceAnswer, practiceView, startPractice } from "@/lib/courses/practice";
import { currentMember } from "@/lib/readers";

export const dynamic = "force-dynamic";

// Member practice RPC. start { testId, retry?, lesson? } (lesson: the lesson whose quiz block started it; its filter is read from the saved block) -> run id and state; answer { id, qid, answer } -> verdict (the right answer is revealed only here); view { id }.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!(await learnFlags()).courses) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  try {
    if (b?.op === "start") return NextResponse.json(await practiceView(u.id, await startPractice(u.id, Number(b.testId), b.retry === true, Number.isInteger(b.lesson) ? b.lesson : undefined)));
    if (b?.op === "view") return NextResponse.json(await practiceView(u.id, Number(b.id)));
    if (b?.op === "answer") return NextResponse.json(await practiceAnswer(u.id, Number(b.id), Number(b.qid), b.answer));
    return new NextResponse("bad op", { status: 400 });
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
