import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { currentMember } from "@/lib/readers";
import { memberReply } from "@/lib/id-card";

export const dynamic = "force-dynamic";

// POST { body }: the member answers staff's question about their new ID.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  try { await memberReply(u, String((await req.json().catch(() => ({}))).body ?? "")); return NextResponse.json({ ok: true }); }
  catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
