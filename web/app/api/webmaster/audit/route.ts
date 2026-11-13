import { NextResponse } from "next/server";
import { auditDetail, revertAudit, queryAudit } from "@/lib/store";
import { actor, editingAllowed, type Section } from "@/lib/guard";

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

// Putting a change back needs write on the page that change belongs to, not just the audit log.
const OWNER: Record<string, [Section, string]> = { menu: ["webmaster", "menu"], board: ["webmaster", "board"], calendar: ["webmaster", "calendar"], hours: ["webmaster", "hours"], robots: ["webmaster", "robots"], privacy: ["admin", "privacy"] };
async function mayRevert(id: number) {
  const d = await auditDetail(id);
  if (!d || d.kind === "none") return true; // nothing to revert: revertAudit refuses with its own message
  const [sec, page] = d.kind === "page" ? ["webmaster", "pages"] as [Section, string] : OWNER[d.family] ?? (d.family.startsWith("guided.") ? ["webmaster", "guided"] as [Section, string] : ["admin", ""]); // unknown family: full admin only
  return editingAllowed(sec, "write", page || undefined);
}

export async function POST(req: Request) {
  if (!(await editingAllowed("admin", "write", "audit"))) return off();
  const { revert } = await req.json().catch(() => ({}));
  if (Number.isInteger(revert) && !(await mayRevert(revert))) return new NextResponse("You don't have access to the page this change belongs to.", { status: 403 });
  if (!Number.isInteger(revert) || !(await revertAudit(revert, await actor()))) return new NextResponse("This change can't be reverted.", { status: 409 });
  return NextResponse.json({ ok: true });
}
