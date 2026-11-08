import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { SIGNUPS_PER_HOUR, resetSignups, signupsThisHour } from "@/lib/readers";
import { logAudit } from "@/lib/store";

export const dynamic = "force-dynamic";
const off = () => new NextResponse("not found", { status: 404 });

// GET: sign-ups used this hour. POST: reset the counter (full admins only).
export async function GET() {
  if (!(await editingAllowed("admin", "read"))) return off();
  return NextResponse.json({ used: await signupsThisHour(), limit: SIGNUPS_PER_HOUR });
}

export async function POST() {
  if (!(await editingAllowed("admin"))) return off();
  await resetSignups();
  await logAudit(await actor(), "signups.reset", "");
  return NextResponse.json({ used: 0, limit: SIGNUPS_PER_HOUR });
}
