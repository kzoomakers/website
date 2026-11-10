import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import * as G from "@/lib/guests";

// Guests admin RPC (CRM): POST { op, ... }. Reading needs CRM view access; settings and deletions need CRM edit access.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("crm", a.op === "list" || a.op === "visits" ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  try {
    switch (a.op) {
      case "list": return NextResponse.json(await G.adminList(String(a.q ?? "")));
      case "visits": return NextResponse.json(await G.adminVisits());
      case "saveCfg": return NextResponse.json(await G.saveCfg(a.cfg, await actor()));
      case "delete": { // an admin may delete before the retention period ended (`override`), and the screen warns first
        const g = await G.getGuest(Number(a.id));
        if (!g) throw new Error("That guest no longer exists.");
        await G.deleteGuest(g, { who: await actor(), override: a.override === true });
        return NextResponse.json({ ok: true });
      }
      default: return new NextResponse("unknown op", { status: 400 });
    }
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
