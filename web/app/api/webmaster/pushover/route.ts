import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as p from "@/lib/pushover";

// Alert delivery RPC: POST { op: "view" | "log" | "save" | "test", ... }. Part of the Admin section (view to read, edit to change). The saved keys are never sent back.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("admin", a.op === "view" || a.op === "log" ? "read" : "write", "pushover"))) return new NextResponse("not found", { status: 404 });
  const who = await actor();
  try {
    switch (a.op) {
      case "view": return NextResponse.json(await p.adminView());
      case "log": return NextResponse.json(await p.recent());
      case "save": await p.saveCfg(a.config ?? {}); await logAudit(who, "pushover.save", ""); return NextResponse.json(await p.adminView());
      case "test": {
        if (!p.channelOk(a.channel)) throw new Error("Unknown alert.");
        const r = await p.notify(a.channel, { title: "Test alert", message: String(a.message ?? "").trim().slice(0, 500) || "Hello from the Kzoo Makers admin page." }, "admin: " + who);
        await logAudit(who, "pushover.test", a.channel);
        if (r.status !== "sent") throw new Error(r.status === "failed" ? `Pushover refused it: ${r.error}` : "Save the application token and this alert's group key first.");
        return NextResponse.json({ ok: true });
      }
      default: return new NextResponse("unknown op", { status: 400 });
    }
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
