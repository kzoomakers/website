import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as ga from "@/lib/ga";

// Google Analytics settings RPC: POST { op: "save" | "test", ... }. Admin only; the service-account key is never sent back.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  try {
    if (a?.op === "test") { await ga.test(); return NextResponse.json({ ok: true }); }
    if (a?.op !== "save") return new NextResponse("unknown op", { status: 400 });
    await ga.save(a);
    await logAudit(await actor(), "ga.save", a.enabled ? "enabled" : "disabled");
    return NextResponse.json(await ga.adminView());
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
