import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { STREAMS, clearLog, enabled, recent, setStream } from "@/lib/debug";

export const dynamic = "force-dynamic";
const off = () => new NextResponse("not found", { status: 404 });

// GET ?stream= returns the streams, which are on, and recent trapped lines. POST { op: "set", stream, on } or { op: "clear", stream? }. Admin only.
export async function GET(req: Request) {
  if (!(await editingAllowed("admin", "read"))) return off();
  const stream = new URL(req.url).searchParams.get("stream") ?? "";
  return NextResponse.json({ streams: STREAMS, on: await enabled(), rows: await recent(stream in STREAMS ? stream : "") }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await editingAllowed("admin"))) return off();
  const a = await req.json().catch(() => null), who = await actor();
  try {
    if (a?.op === "set") { await setStream(String(a.stream), !!a.on); await logAudit(who, "debug.set", `${a.stream} ${a.on ? "on" : "off"}`); }
    else if (a?.op === "clear") { await clearLog(String(a.stream ?? "")); await logAudit(who, "debug.clear", String(a.stream ?? "all")); }
    else return new NextResponse("bad request", { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
