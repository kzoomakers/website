import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { hit, tooBig } from "@/lib/limit";
import { currentMember } from "@/lib/readers";
import * as t from "@/lib/training/attempts";

// Member test-taking: POST { op, ... }, always as the signed-in approved member, always about their own attempts. Grading happens here, never in the browser.
export const dynamic = "force-dynamic";
const LIMITS: Record<string, [number, number]> = { start: [20, 3600_000], save: [600, 600_000], submit: [20, 3600_000] };

export async function POST(req: Request) {
  if (tooBig(req, 0.1)) return new NextResponse("too large", { status: 413 });
  const [u, a] = await Promise.all([currentMember().catch(() => null), req.json().catch(() => null)]);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?", lim = LIMITS[a.op];
  if (lim && !(await hit(`train:${a.op}:${u.id}`, lim[0], lim[1])) || lim && !(await hit(`train-ip:${a.op}:${ip}`, lim[0] * 5, lim[1]))) return new NextResponse("Slow down a little.", { status: 429 });
  try {
    switch (a.op) {
      case "start": return NextResponse.json(await t.start(u.id, a.testId));
      case "save": return NextResponse.json(await t.save(u.id, a.attemptId, a.answers, a.seq));
      case "submit": return NextResponse.json(await t.submit(u.id, a.attemptId, a.answers));
      case "result": return NextResponse.json(await t.result(u.id, a.attemptId));
      default: return new NextResponse("unknown op", { status: 400 });
    }
  } catch (e: any) { return e?.message === "not found" ? new NextResponse("not found", { status: 404 }) : new NextResponse(errMsg(e), { status: 400 }); }
}
