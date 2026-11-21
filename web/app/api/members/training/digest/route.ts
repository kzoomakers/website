import { NextResponse } from "next/server";
import { conn } from "@/lib/db";
import { hit, tooBig } from "@/lib/limit";
import { currentMember } from "@/lib/readers";

export const dynamic = "force-dynamic";

// POST { on: boolean }: the signed-in trainer's choice about the Monday "who is waiting" email.
export async function POST(req: Request) {
  if (tooBig(req, 0.01)) return new NextResponse("too large", { status: 413 });
  const u = await currentMember().catch(() => null), b = await req.json().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (typeof b?.on !== "boolean") return new NextResponse("bad request", { status: 400 });
  if (!(await hit(`train-digest:${u.id}`, 30, 600_000))) return new NextResponse("Slow down a little.", { status: 429 });
  await (await conn()).query("UPDATE site_users SET trainer_digest = $2 WHERE id = $1", [u.id, b.on]);
  return NextResponse.json({ ok: true });
}
