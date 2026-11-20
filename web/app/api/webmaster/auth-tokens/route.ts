import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as t from "@/lib/app-tokens";

// Phone-app sign-ins admin RPC: POST { op, ...args }. Part of the Admin section (view to list, edit to revoke).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("admin", a.op === "list" ? "read" : "write", "auth-tokens"))) return new NextResponse("not found", { status: 404 });
  const who = await actor();
  try {
    if (a.op === "list") return NextResponse.json({ tokens: await t.listTokens() });
    if (a.op === "revoke") { await t.revokeToken(String(a.hash)); await logAudit(who, "apptoken.revoke", `${a.email ?? ""} (${a.device ?? ""})`); return NextResponse.json({ ok: true }); }
    if (a.op === "revokePerson") { const n = await t.revokePerson(String(a.email)); await logAudit(who, "apptoken.revoke", `${a.email} (all ${n} devices)`); return NextResponse.json({ ok: true }); }
    return new NextResponse("unknown op", { status: 400 });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
