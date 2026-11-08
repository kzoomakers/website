import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { postVisitor, visitorThread } from "@/lib/tours";
import { baseUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";
const fail = (e: any) => new NextResponse(errMsg(e), { status: 400 });

// GET ?token: the conversation as the visitor sees it (internal notes left out). POST { token, body }: the visitor replies. The emailed token is the credential.
export async function GET(req: Request) {
  try { return NextResponse.json(await visitorThread(new URL(req.url).searchParams.get("token") ?? "")); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.token !== "string" || typeof b?.body !== "string") return new NextResponse("bad request", { status: 400 });
  try { await postVisitor(b.token, b.body, await baseUrl(req)); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}
