import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { baseUrl } from "@/lib/mail";
import * as h from "@/lib/handbook";

// Handbook updates RPC: POST { op, ... }. "state" needs Website view access; everything else Website edit access.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("webmaster", a.op === "state" ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  const id = Number(a.id);
  try {
    switch (a.op) {
      case "state": return NextResponse.json(await h.state());
      case "aiSummary": return NextResponse.json({ text: await h.aiSummary(id) });
      case "skip": await h.skip(id); await logAudit(await actor(), "handbook.skip", String(id)); return NextResponse.json({ ok: true });
      case "send": { const n = await h.send(id, { summary: a.summary, exact: !!a.exact }, await actor(), await baseUrl(req)); await logAudit(await actor(), "handbook.send", `${n} people`); return NextResponse.json({ sent: n }); }
      default: return new NextResponse("unknown op", { status: 400 });
    }
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
