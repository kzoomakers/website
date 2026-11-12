import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, canSpecial, editingAllowed } from "@/lib/guard";
import { baseUrl } from "@/lib/mail";
import * as w from "@/lib/waiver";

// Agreement admin RPC (CRM): POST { op, kind?: "member" | "guest", ...args }. Reads need CRM view access; drafts and the AI summary need CRM edit access; publishing also needs the special permission for that agreement.
// Versions can't be edited or deleted: that is deliberate.
export const dynamic = "force-dynamic";
const WRITE = ["publish", "aiSummary", "saveDraft", "discardDraft"];

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  const kind: w.Kind = a.kind === "guest" ? "guest" : "member";
  if (!(await editingAllowed("crm", WRITE.includes(a.op) ? "write" : "read", kind === "guest" ? "guest-agreement" : "waiver"))) return new NextResponse("not found", { status: 404 });
  if (a.op === "publish" && !(await canSpecial(`agreement.${kind}`))) return new NextResponse("You don't have the special permission to publish this agreement. Ask an administrator (Admin > Access > Special permissions).", { status: 403 });
  try {
    switch (a.op) {
      case "versions": return NextResponse.json(await w.listVersions(kind));
      case "members": return NextResponse.json(await w.members(String(a.q ?? ""), String(a.version ?? "")));
      case "publish": return NextResponse.json({ id: await w.publish(a.draft ?? {}, await actor(), await baseUrl(req), kind) });
      case "aiSummary": return NextResponse.json({ text: await w.aiSummary(a.draft ?? {}, kind) });
      case "saveDraft": await w.saveDraft(kind, a.draft ?? {}, await actor()); return NextResponse.json({ ok: true });
      case "discardDraft": await w.discardDraft(kind, await actor()); return NextResponse.json({ ok: true });
      default: return new NextResponse("unknown op", { status: 400 });
    }
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
