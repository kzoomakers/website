import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { heldSummary } from "@/lib/contact";
import { editingAllowed, levelOf, me } from "@/lib/guard";
import { actorFor, waitingCount } from "@/lib/training/certs";
import { alertSummary } from "@/lib/approvals";

// What is waiting for an admin: pending reviews, comments, held contact messages and walk-ups needing times, with the newest id of each (the popup uses it to know what is new).
export async function GET() {
  // Each kind of alert is for people who can open the page that handles it.
  const [web, blog, forms, crm, tours, ids, train, lib] = await Promise.all([editingAllowed("website", "read", "reviews"), editingAllowed("blog", "read", "comments"), editingAllowed("messages", "read"), editingAllowed("people", "read", "approvals"), editingAllowed("tours", "read", "walkups"), editingAllowed("people", "read", "id-renewals"), editingAllowed("training", "read", "queue"), editingAllowed("library", "read", "documents")]);
  if (![web, blog, forms, crm, tours, ids, train, lib].some(Boolean)) return new NextResponse("not found", { status: 404 });
  const d = db();
  if (!d) return NextResponse.json({ reviews: 0, reviewMax: 0, comments: 0, commentMax: 0, forms: 0, formMax: 0, applicants: 0, applicantMax: 0, walkups: 0, renewals: 0, training: 0, library: 0 });
  await d.ready;
  const r = (await d.pool.query(`SELECT
    (SELECT count(*)::int FROM review_submissions WHERE status = 'pending') AS reviews, (SELECT COALESCE(max(id), 0) FROM review_submissions WHERE status = 'pending') AS "reviewMax",
    (SELECT count(*)::int FROM comments WHERE status = 'pending') AS comments, (SELECT COALESCE(max(id), 0) FROM comments WHERE status = 'pending') AS "commentMax"`)).rows[0];
  const h = forms ? await heldSummary().catch(() => ({ n: 0, max: 0 })) : { n: 0, max: 0 };
  const a = crm ? await alertSummary().catch(() => ({ applicants: 0, applicantMax: 0 })) : { applicants: 0, applicantMax: 0 };
  const walkups = tours ? await d.pool.query("SELECT count(*)::int AS n FROM tour_requests WHERE status = 'open'").then((x) => x.rows[0].n, () => 0) : 0; // walk-ups still needing times
  const renewals = ids ? await d.pool.query("SELECT count(*)::int AS n FROM id_renewals WHERE state = 'pending'").then((x) => x.rows[0].n, () => 0) : 0; // replacement IDs waiting for staff
  const training = train ? await (async () => { const m = await me(); return waitingCount(await actorFor(m?.email ?? "", levelOf(m, "training") === "write", !!levelOf(m, "training"))); })().catch(() => 0) : 0; // passed tests nobody has picked up, for the tools this person trains
  const library = lib ? await d.pool.query("SELECT count(*)::int AS n FROM lib_docs WHERE review_on < current_date AND status = 'published' AND deleted_at IS NULL").then((x) => x.rows[0].n, () => 0) : 0; // SOPs past their review date
  // Each kind is shown only to people who can open its page.
  const keep = { ...r, ...(web ? {} : { reviews: 0, reviewMax: 0 }), ...(blog ? {} : { comments: 0, commentMax: 0 }) };
  return NextResponse.json({ ...keep, forms: h.n, formMax: h.max, walkups, renewals, training, library, ...a }, { headers: { "cache-control": "no-store" } });
}
