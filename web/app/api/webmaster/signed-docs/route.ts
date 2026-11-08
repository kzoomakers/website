import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { baseUrl } from "@/lib/mail";
import { db } from "@/lib/db";
import * as s from "@/lib/sign";

// Board papers RPC (papers, templates and their public links): POST { op, ...args }. Reads need Signed Docs view access, everything else edit access.
export const dynamic = "force-dynamic";
const READS = new Set(["list", "buckets", "tags", "get", "people", "templates", "template"]);

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("board", READS.has(a.op) ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), id = Number(a.id), base = await baseUrl(req);
  try {
    switch (a.op) {
      case "list": return NextResponse.json(await s.listDocs({ bucket: Number(a.bucket) || undefined, tag: a.tag, status: a.status, q: a.q }));
      case "get": return NextResponse.json(await s.getDoc(id));
      case "buckets": return NextResponse.json(await s.listBuckets());
      case "tags": return NextResponse.json(await s.listTags());
      case "people": { // people you used in the last 6 months, then site accounts, to pick signers from
        const like = "%" + String(a.q ?? "").trim().slice(0, 50).replace(/[\\%_]/g, "\\$&") + "%";
        const d = db()!; await d.ready;
        const seen = new Set<string>(), out: { name: string; email: string }[] = [];
        const accounts = String(a.q ?? "").trim() ? (await d.pool.query("SELECT name, email FROM site_users WHERE verified_at IS NOT NULL AND approval = 'approved' AND (name ILIKE $1 OR email ILIKE $1) ORDER BY lower(name) LIMIT 15", [like])).rows : [];
        for (const p of [...(await s.recentContacts(String(a.q ?? ""))), ...accounts]) if (!seen.has(p.email.toLowerCase())) { seen.add(p.email.toLowerCase()); out.push(p); }
        return NextResponse.json(out);
      }
      case "templates": return NextResponse.json(await s.listTemplates());
      case "template": return NextResponse.json(await s.getTemplate(id));
      case "saveTemplate": return NextResponse.json({ id: await s.saveTemplate(a.doc ?? {}, who) });
      case "deleteTemplate": await s.deleteTemplate(id); break;
      case "setPublic": return NextResponse.json({ token: await s.setPublic(id, !!a.on) });
      case "create": return NextResponse.json(await s.createDoc(a.doc ?? {}, who, base));
      case "send": { const link = await s.sendOne(id, Number(a.signer), who, base, !!a.copy); return NextResponse.json({ link }); }
      case "remind": return NextResponse.json({ sent: await s.remind(id, who, base) });
      case "void": await s.voidDoc(id, who); break;
      case "due": await s.setDue(id, a.due || null); break;
      case "addBucket": await s.addBucket(String(a.name ?? "")); break;
      case "deleteBucket": await s.deleteBucket(id); break;
      default: return new NextResponse("unknown op", { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
