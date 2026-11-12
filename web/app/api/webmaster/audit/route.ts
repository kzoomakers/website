import { NextResponse } from "next/server";
import { auditDetail, revertAudit, queryAudit } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

const off = () => new NextResponse("not found", { status: 404 });

export async function GET(req: Request) {
  if (!(await editingAllowed("admin", "read", "audit"))) return off();
  const p = new URL(req.url).searchParams;
  if (p.has("id")) {
    const d = Number.isInteger(Number(p.get("id"))) ? await auditDetail(Number(p.get("id"))) : null;
    return d ? NextResponse.json(d) : off();
  }
  const list = (k: string) => p.get(k)?.split("\u0001").filter(Boolean) ?? [];
  return NextResponse.json(await queryAudit({ q: p.get("q") ?? "", actors: list("actor"), sections: list("section"), actions: list("action"), from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, sort: p.get("sort") ?? undefined, after: Number(p.get("after")) || undefined, unit: p.get("unit") ?? undefined }));
}

export async function POST(req: Request) {
  if (!(await editingAllowed("admin", "write", "audit"))) return off();
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertAudit(revert, await actor()))) return new NextResponse("This change can't be reverted.", { status: 409 });
  return NextResponse.json({ ok: true });
}
