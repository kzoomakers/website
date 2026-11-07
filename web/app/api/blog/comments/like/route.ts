import { NextResponse } from "next/server";
import { currentReader } from "@/lib/readers";
import { toggleLike } from "@/lib/comments";

export async function POST(req: Request) {
  const u = await currentReader();
  if (!u) return new NextResponse("Please sign in to like comments.", { status: 401 });
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.id)) return new NextResponse("bad request", { status: 400 });
  try {
    return NextResponse.json(await toggleLike(b.id, u.id));
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}
