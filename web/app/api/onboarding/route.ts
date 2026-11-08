import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { currentApplicant } from "@/lib/readers";
import { baseUrl } from "@/lib/mail";
import { clientIp } from "@/lib/comments";
import * as o from "@/lib/onboarding";
import { latestVersion } from "@/lib/waiver";
import { RELATIONSHIPS } from "@/lib/profiles";

export const dynamic = "force-dynamic";

// POST { step: "waiver", signature, drawn? } or { step: "handbook" }: the post-approval steps, in order. (Photo ID is /api/onboarding/id.)
export async function POST(req: Request) {
  const u = await currentApplicant().catch(() => null);
  if (!u || u.approval !== "approved") return new NextResponse("Sign in first.", { status: 401 });
  const a = await req.json().catch(() => null);
  try {
    if (a?.step === "waiver") await o.sign(u, String(a.signature ?? ""), String(a.initials ?? ""), String(a.drawn ?? ""), { ip: clientIp(req), ua: req.headers.get("user-agent") ?? "" }, await baseUrl(req));
    else if (a?.step === "handbook" && a.read === true) await o.handbookRead(u.id);
    else if (a?.step === "welcome") await o.welcomed(u.id);
    else return new NextResponse("bad request", { status: 400 });
    return NextResponse.json({ step: await o.getStep(u.id) });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}

// GET: where the signed-in person is, plus what the welcome wizard needs to show it (the agreement text only while that is the step). Polled while they wait for approval.
export async function GET() {
  const u = await currentApplicant().catch(() => null);
  if (!u || u.approval !== "approved") return new NextResponse("Sign in first.", { status: 401 });
  const step = await o.getStep(u.id);
  return NextResponse.json({ step, fresh: u.fresh, name: u.name, kinds: o.ID_KINDS, relationships: RELATIONSHIPS, version: step === "waiver" ? await latestVersion() : null });
}
