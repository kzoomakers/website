import { NextResponse } from "next/server";
import { conn } from "@/lib/db";
import { hit, tooBig } from "@/lib/limit";
import { currentMember } from "@/lib/readers";

export const dynamic = "force-dynamic";

// POST { mode: "" | "first" | "full" }: the signed-in member's choice about Discord announcements of their certifications. Takes effect at send time.
export async function POST(req: Request) {
  if (tooBig(req, 0.01)) return new NextResponse("too large", { status: 413 });
  const u = await currentMember().catch(() => null), b = await req.json().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!["", "first", "full"].includes(b?.mode)) return new NextResponse("bad request", { status: 400 });
  if (!(await hit(`train-announce:${u.id}`, 30, 600_000))) return new NextResponse("Slow down a little.", { status: 429 });
  await (await conn()).query("UPDATE site_users SET discord_announce = $2 WHERE id = $1", [u.id, b.mode]);
  return NextResponse.json({ ok: true });
}
