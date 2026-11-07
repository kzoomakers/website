import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { heldSummary } from "@/lib/contact";
import { editingAllowed } from "@/lib/guard";

// What is waiting for an admin: pending reviews, comments and held contact messages, with the newest id of each (the popup uses it to know what is new).
export async function GET() {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const d = db();
  if (!d) return NextResponse.json({ reviews: 0, reviewMax: 0, comments: 0, commentMax: 0, forms: 0, formMax: 0 });
  await d.ready;
  const r = (await d.pool.query(`SELECT
    (SELECT count(*)::int FROM review_submissions WHERE status = 'pending') AS reviews, (SELECT COALESCE(max(id), 0) FROM review_submissions WHERE status = 'pending') AS "reviewMax",
    (SELECT count(*)::int FROM comments WHERE status = 'pending') AS comments, (SELECT COALESCE(max(id), 0) FROM comments WHERE status = 'pending') AS "commentMax"`)).rows[0];
  const h = await heldSummary().catch(() => ({ n: 0, max: 0 }));
  return NextResponse.json({ ...r, forms: h.n, formMax: h.max }, { headers: { "cache-control": "no-store" } });
}
