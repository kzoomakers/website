import { NextResponse } from "next/server";
import { pgStats } from "@/lib/pgstats";
import { editingAllowed } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await editingAllowed("admin", "read"))) return new NextResponse("not found", { status: 404 });
  try { return NextResponse.json(await pgStats(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return new NextResponse("Could not read the database statistics.", { status: 500 }); }
}
