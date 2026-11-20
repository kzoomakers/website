import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { requestCode } from "@/lib/readers";
import { hashIp } from "@/lib/comments";

// POST { email } emails a member a 6-digit sign-in code for the phone app. The answer is the same whether or not the address has an account.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.email !== "string") return new NextResponse("bad request", { status: 400 });
  try { await requestCode(b.email, hashIp(req)); return NextResponse.json({ ok: true }); } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
