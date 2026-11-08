import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { baseUrl } from "@/lib/mail";
import * as w from "@/lib/waiver";

// Membership-agreement admin RPC (CRM): POST { op, ...args }. Reads need CRM view access, publishing needs CRM edit access. Versions can't be edited or deleted: that is deliberate.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("crm", a.op === "publish" ? "write" : "read"))) return new NextResponse("not found", { status: 404 });
  try {
    switch (a.op) {
      case "versions": return NextResponse.json(await w.listVersions());
      case "members": return NextResponse.json(await w.members(String(a.q ?? ""), String(a.version ?? "")));
      case "publish": return NextResponse.json({ id: await w.publish(a.draft ?? {}, await actor(), await baseUrl(req)) });
      default: return new NextResponse("unknown op", { status: 400 });
    }
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
