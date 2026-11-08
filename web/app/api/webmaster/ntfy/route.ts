import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as n from "@/lib/ntfy";

// ntfy admin RPC: POST { op, ...args }. Part of the Admin section (view to read, edit to change).
export const dynamic = "force-dynamic";
const READS = new Set(["topics", "messages", "clients", "tokens", "links", "config"]);

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("admin", READS.has(a.op) ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  const who = await actor();
  try {
    let out: unknown = { ok: true }, target = String(a.topic?.name ?? a.name ?? a.token?.label ?? "");
    switch (a.op) {
      case "topics": return NextResponse.json(await n.listTopics());
      case "messages": return NextResponse.json(await n.topicMessages(String(a.name), Number.isFinite(a.before) ? a.before : null));
      case "clients": return NextResponse.json(await n.topicClients(String(a.name)));
      case "tokens": return NextResponse.json(await n.listAllTokens());
      case "links": return NextResponse.json(await n.listLinks(String(a.name)));
      case "addLink": await n.addLink(String(a.source), String(a.target)); target = `${a.source} -> ${a.target}`; break;
      case "removeLink": await n.removeLink(String(a.source), String(a.target)); target = `${a.source} -> ${a.target}`; break;
      case "config": { const { upstreamToken, ...c } = await n.getCfg(); return NextResponse.json({ ...c, hasToken: !!upstreamToken }); }
      case "saveConfig": await n.saveCfg(a.config ?? {}); target = String(a.config?.upstream ?? ""); break;
      case "saveTopic": await n.saveTopic(a.topic ?? {}, who); break;
      case "deleteTopic": await n.deleteTopic(String(a.name)); break;
      case "send": await n.publish(String(a.name), { title: a.title, message: a.message, priority: a.priority }, "admin: " + who); break;
      case "createToken": out = { token: await n.createToken(a.token ?? {}, who) }; break;
      case "deleteToken": await n.deleteToken(String(a.hash)); break;
      default: return new NextResponse("unknown op", { status: 400 });
    }
    await logAudit(who, "ntfy." + a.op, target); // the token itself is never logged
    return NextResponse.json(out);
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
