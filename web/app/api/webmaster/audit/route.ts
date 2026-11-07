import { NextResponse } from "next/server";
import { auditDetail, revertAudit, searchAudit } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

const off = () => new NextResponse("not found", { status: 404 });

export async function GET(req: Request) {
  if (!(await editingAllowed())) return off();
  const p = new URL(req.url).searchParams;
  if (p.has("id")) {
    const d = Number.isInteger(Number(p.get("id"))) ? await auditDetail(Number(p.get("id"))) : null;
    return d ? NextResponse.json(d) : off();
  }
  return NextResponse.json(await searchAudit(p.get("q") ?? ""));
}

export async function POST(req: Request) {
  if (!(await editingAllowed())) return off();
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertAudit(revert, await actor()))) return new NextResponse("This change can't be reverted.", { status: 409 });
  return NextResponse.json({ ok: true });
}
