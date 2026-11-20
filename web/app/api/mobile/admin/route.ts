import { NextResponse } from "next/server";
import { SECTIONS, hasAny, levelOf, me } from "@/lib/guard";

export const dynamic = "force-dynamic";

// What the phone app's Admin tab may show: the sections this admin has any access to, and which of those they may change. The data routes still check every request.
export async function GET() {
  const m = await me().catch(() => null);
  const have = m ? SECTIONS.filter((s) => hasAny(m, s)) : [];
  if (!m || !have.length) return new NextResponse("not found", { status: 404 });
  return NextResponse.json({ email: m.email, name: m.name, sections: have, write: have.filter((s) => levelOf(m, s) === "write") });
}
