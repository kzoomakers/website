import { NextResponse } from "next/server";
import { conn } from "@/lib/db";
import { currentMember } from "@/lib/readers";

export const dynamic = "force-dynamic";

// POST { mode: "" | "first" | "full" }: the signed-in member's choice about Discord announcements of their certifications. Takes effect at send time.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null), b = await req.json().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!["", "first", "full"].includes(b?.mode)) return new NextResponse("bad request", { status: 400 });
  await (await conn()).query("UPDATE site_users SET discord_announce = $2 WHERE id = $1", [u.id, b.mode]);
  return NextResponse.json({ ok: true });
}
