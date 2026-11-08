import { NextResponse } from "next/server";
import { currentReader } from "@/lib/readers";
import { listNotes, markRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";
const who = () => currentReader().catch(() => null);

// The signed-in member's notifications and unread count.
export async function GET() {
  const u = await who();
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  return NextResponse.json(await listNotes(u.id, 30));
}

// POST { ids: number[] } or { all: true } marks read.
export async function POST(req: Request) {
  const u = await who(), b = await req.json().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  const ids = Array.isArray(b?.ids) ? b.ids.filter(Number.isInteger) : null;
  if (!b?.all && !ids?.length) return new NextResponse("bad request", { status: 400 });
  await markRead(u.id, b.all ? undefined : ids);
  return NextResponse.json({ ok: true });
}
