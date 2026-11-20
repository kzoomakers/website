import { NextResponse } from "next/server";
import { getFeedConfig, saveFeedConfig } from "@/feed/config";
import { actor, editingAllowed } from "@/lib/guard";

export async function GET() {
  if (!(await editingAllowed("system", "read", "feed"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await getFeedConfig());
}

export async function PUT(req: Request) {
  if (!(await editingAllowed("system", "write", "feed"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return new NextResponse("bad request", { status: 400 });
  return NextResponse.json(await saveFeedConfig(b, await actor())); // normalize() inside drops anything invalid
}
