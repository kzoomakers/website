import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { requestByToken, respond } from "@/lib/tours";
import { baseUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";
const fail = (e: any) => new NextResponse(errMsg(e), { status: 400 });

// GET ?token: the times on offer. POST { token, pick?, note? }: pick an option, or omit pick to ask for other times (the token is the credential).
export async function GET(req: Request) {
  try { return NextResponse.json(await requestByToken(new URL(req.url).searchParams.get("token") ?? "")); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.token !== "string" || (b.pick != null && !Number.isInteger(b.pick))) return new NextResponse("bad request", { status: 400 });
  try { return NextResponse.json(await respond(b.token, b.pick ?? null, typeof b.note === "string" ? b.note : "", await baseUrl(req))); } catch (e) { return fail(e); }
}
