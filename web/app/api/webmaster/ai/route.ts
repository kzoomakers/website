import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as ai from "@/lib/ai";

// AI settings RPC: POST { op, ...args }. Part of the Admin section. Tokens are never sent back, only whether they are set.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("admin", a.op === "view" ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  try {
    switch (a.op) {
      case "view": return NextResponse.json(await ai.adminView());
      case "saveKey": await ai.saveKey(a.provider, String(a.key ?? "")); break;
      case "discover": await ai.discover(a.provider); break;
      case "saveScenario": await ai.saveScenario(a.id, a.provider, a.model); break;
      case "test": return NextResponse.json({ text: await ai.complete(String(a.id), "Reply with the single word: ready", "ping", 20) });
      default: return new NextResponse("unknown op", { status: 400 });
    }
    await logAudit(await actor(), "ai." + a.op, String(a.provider ?? a.id ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
