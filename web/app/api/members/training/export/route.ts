import { NextResponse } from "next/server";
import { conn } from "@/lib/db";
import { hit } from "@/lib/limit";
import { logSelf } from "@/lib/pii";
import { currentMember } from "@/lib/readers";
import { trainingRecord } from "@/lib/training/privacy";

export const dynamic = "force-dynamic";

// GET: the signed-in member's own training record as a JSON file. Their own visit is logged (as "self"); staff notes they can't read are left out.
export async function GET(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!(await hit(`train-export-self:${u.id}`, 10, 3600_000))) return new NextResponse("Slow down a little.", { status: 429 });
  const data = await trainingRecord(await conn(), u.id, true);
  if (!data) return new NextResponse("not found", { status: 404 });
  await logSelf(req, { id: u.id, email: u.email }, { type: "member", id: u.id }, "training", u.name, ["training_record"]);
  return new NextResponse(JSON.stringify({ ...data, exported_at: new Date().toISOString() }, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=\"my-training-record.json\"", "cache-control": "no-store" } });
}
