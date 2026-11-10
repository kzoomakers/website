import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as ga from "@/lib/ga";
import * as notice from "@/lib/ga-notify";

// Google Analytics settings RPC: POST { op: "save" | "test" | "overview" | "subscribe" | "unsubscribe" | "digest" | "digest-now", ... }. Admin only; the service-account key is never sent back.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  try {
    if (a?.op === "test") { await ga.test(); return NextResponse.json({ ok: true }); }
    if (a?.op === "overview") return NextResponse.json(await notice.overview());
    if (a?.op === "subscribe") { await notice.subscribe(a.topic); return NextResponse.json(await notice.overview()); }
    if (a?.op === "unsubscribe") { await notice.unsubscribe(a.topic); return NextResponse.json(await notice.overview()); }
    if (a?.op === "digest") { await notice.saveDigest(a); await logAudit(await actor(), "ga.digest", a.on ? "on" : "off"); return NextResponse.json(await notice.overview()); }
    if (a?.op === "digest-now") { await notice.sendDigest((await notice.getDigest()).emails); return NextResponse.json({ ok: true }); }
    if (a?.op !== "save") return new NextResponse("unknown op", { status: 400 });
    await ga.save(a);
    await logAudit(await actor(), "ga.save", a.enabled ? "enabled" : "disabled");
    return NextResponse.json(await ga.adminView());
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
