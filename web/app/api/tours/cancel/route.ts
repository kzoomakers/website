import { NextResponse } from "next/server";
import { cancelByToken } from "@/lib/tours";

// POST { token }: the visitor's own cancel link (the token is the credential).
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.token !== "string") return new NextResponse("bad request", { status: 400 });
  try { return NextResponse.json(await cancelByToken(b.token, true)); } catch (e: any) { return new NextResponse(e.message, { status: 400 }); }
}
