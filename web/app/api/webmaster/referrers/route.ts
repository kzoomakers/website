import { NextResponse } from "next/server";
import { stats } from "@/lib/referrers";
import { editingAllowed } from "@/lib/guard";

export async function GET(req: Request) {
  if (!(await editingAllowed("webmaster", "read"))) return new NextResponse("not found", { status: 404 });
  const p = new URL(req.url).searchParams, kind = p.get("kind") ?? "";
  if (!["ai", "search", "social", "other"].includes(kind)) return new NextResponse("bad kind", { status: 400 });
  try { return NextResponse.json(await stats(kind as "ai", p.get("from") ?? "", p.get("to") ?? "")); }
  catch (e) {
    if (e instanceof Error && /^(bad dates|range too long)$/.test(e.message)) return new NextResponse("Pick a valid range of up to a year.", { status: 400 });
    console.error("Referrer stats failed:", e);
    return new NextResponse("The query failed. Try again.", { status: 500 });
  }
}
