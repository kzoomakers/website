import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { listPeople } from "@/lib/profiles";
import { logAudit } from "@/lib/store";

export const dynamic = "force-dynamic";
const cell = (v: unknown) => { const t = String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&"); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

// GET ?q&sort&dir&status&approval&level&flag&offset lists site accounts for CRM (50 a page). &export=1 returns the whole filtered list as CSV (no phone or address).
export async function GET(req: Request) {
  if (!(await editingAllowed("crm", "read", "*"))) return new NextResponse("not found", { status: 404 });
  const g = new URL(req.url).searchParams, o = { q: g.get("q") ?? "", sort: g.get("sort") ?? "", dir: g.get("dir") ?? "", status: g.get("status") ?? "", approval: g.get("approval") ?? "", level: g.get("level") ?? "", flag: g.get("flag") ?? "", offset: Number(g.get("offset")) || 0 };
  if (!g.get("export")) return NextResponse.json(await listPeople(o));
  const { rows } = await listPeople({ ...o, offset: 0, limit: 10000 });
  await logAudit(await actor(), "crm.export", `${rows.length} people`);
  const csv = ["Name,Email,Approval,Disabled,Membership,Joined,Card,Emergency contacts,Waiver signed", ...rows.map((p) => [p.name, p.email, p.approval, p.disabled ? "yes" : "", p.levels.join("; "), new Date(p.joined).toISOString().slice(0, 10), p.card, p.contacts, p.waiver ? "yes" : ""].map(cell).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="people.csv"', "cache-control": "no-store" } });
}
