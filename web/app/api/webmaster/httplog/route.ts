import { NextResponse } from "next/server";
import { detail, query } from "@/lib/httplog";
import { editingAllowed } from "@/lib/guard";

const off = () => new NextResponse("not found", { status: 404 });

export async function GET(req: Request) {
  if (!(await editingAllowed("admin", "read"))) return off();
  const p = new URL(req.url).searchParams;
  try {
    if (p.has("id")) { const d = await detail(Number(p.get("id")), p.get("at") ?? ""); return d ? NextResponse.json(d) : off(); }
    const g = (k: string) => p.get(k) ?? undefined;
    return NextResponse.json(await query({ q: g("q"), from: g("from"), to: g("to"), method: g("method"), ip: g("ip"), path: g("path"), host: g("host"), user: g("user"), unit: g("unit"), offset: Number(p.get("offset")) }));
  } catch { return new NextResponse("The query failed or timed out. Try a shorter time range.", { status: 500 }); }
}
