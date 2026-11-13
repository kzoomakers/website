import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { checkinByToken, respondCheckin } from "@/lib/tours";
import { baseUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";
const fail = (e: any) => new NextResponse(errMsg(e), { status: 400 });

// GET ?token: who this is for. POST { token, answer, months?, note? }: record the answer (the token is the credential).
export async function GET(req: Request) {
  try { return NextResponse.json(await checkinByToken(new URL(req.url).searchParams.get("token") ?? "")); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.token !== "string") return new NextResponse("bad request", { status: 400 });
  try { return NextResponse.json(await respondCheckin(b.token, b.answer, b.months, b.note, await baseUrl(req))); } catch (e) { return fail(e); }
}
