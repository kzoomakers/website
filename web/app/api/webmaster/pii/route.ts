import { NextResponse } from "next/server";
import { actor, me } from "@/lib/guard";
import { errMsg } from "@/lib/errmsg";
import { logAudit } from "@/lib/store";
import { baseUrl } from "@/lib/mail";
import * as P from "@/lib/pii";

export const dynamic = "force-dynamic";

// Audit PII page RPC: POST { op, ... }. Full administrators and people on the Audit PII list may read; changing settings and sending the report is for full administrators.
const csv = (rows: Record<string, unknown>[]) => {
  const cols = ["id", "at", "viewer_email", "viewer_is_admin", "subject_type", "subject_id", "subject_name", "kind", "fields", "reason", "note", "via", "ip", "ua", "request_path"];
  const cell = (v: unknown) => { let t = Array.isArray(v) ? v.join("|") : v instanceof Date ? v.toISOString() : String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; }; // a leading = + - @ would run as a formula in a spreadsheet
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
};

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op || !(await P.mayAudit())) return new NextResponse("not found", { status: 404 });
  const full = (await me())?.perms.system === "write";
  try {
    switch (a.op) {
      case "events": return NextResponse.json(await P.events(a.f ?? {}));
      case "export": {
        const rows = await P.events({ ...(a.f ?? {}), limit: 5000 });
        await logAudit(await actor(), "pii.export", `${rows.length} rows`); // the export is itself on record
        return new NextResponse(csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="pii-access.csv"', "cache-control": "no-store" } });
      }
      case "subjects": return NextResponse.json(await P.findSubjects(String(a.q ?? "")));
      case "subject": return NextResponse.json(await P.bySubject(String(a.type), Number(a.id)));
      case "http": return NextResponse.json(await P.httpHits(a.unmatched !== false));
      case "flags": return NextResponse.json(await P.flags());
      case "integrity": return NextResponse.json({ ...(await P.verifyChain()), cfg: await P.getCfg(), runs: await P.reportRuns() });
      case "preview": return NextResponse.json(await P.buildReport(String(a.month), await baseUrl(req)));
    }
    if (!full) return new NextResponse("Only a full administrator can do that.", { status: 403 });
    switch (a.op) {
      case "saveCfg": { const c = await P.saveCfg(a.cfg); await logAudit(await actor(), "pii.settings", `locked=${c.locked}, bulk=${c.bulk}`); return NextResponse.json(c); }
      case "send": { const r = await P.sendReport(String(a.month), true); await logAudit(await actor(), "pii.report", String(a.month)); return NextResponse.json({ sent: r.sent, count: r.count }); }
    }
    return new NextResponse("unknown op", { status: 400 });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: e instanceof P.PiiError ? e.status : 400 }); }
}
