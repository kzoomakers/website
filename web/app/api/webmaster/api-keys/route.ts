import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as k from "@/lib/api-keys";

// API keys admin RPC: POST { op, ...args }. Part of the Admin section (view to list, edit to change).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("admin", a.op === "list" ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  const who = await actor();
  try {
    if (a.op === "list") return NextResponse.json({ keys: await k.listKeys(), scopes: k.SCOPES });
    if (a.op === "create") { const key = await k.createKey(a.key ?? {}, who); await logAudit(who, "apikey.create", String(a.key?.label ?? "")); return NextResponse.json({ key }); } // the key itself is never logged
    if (a.op === "delete") { await k.deleteKey(String(a.hash)); await logAudit(who, "apikey.delete", String(a.label ?? "")); return NextResponse.json({ ok: true }); }
    return new NextResponse("unknown op", { status: 400 });
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
