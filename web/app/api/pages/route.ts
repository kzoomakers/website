import { NextResponse } from "next/server";
import { deletePage, listPages, savePage } from "@/lib/store";
import { editingAllowed } from "@/lib/guard";

const off = () => new NextResponse("not found", { status: 404 });

export async function GET() {
  return editingAllowed() ? NextResponse.json(await listPages()) : off();
}

export async function PUT(req: Request) {
  if (!editingAllowed()) return off();
  const { slug, data } = await req.json();
  if (typeof slug !== "string" || !Array.isArray(data?.content)) return new NextResponse("bad request", { status: 400 });
  try { await savePage(slug, data); } catch { return new NextResponse("bad slug", { status: 400 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!editingAllowed()) return off();
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  try { await deletePage(slug); } catch { return new NextResponse("bad slug", { status: 400 }); }
  return NextResponse.json({ ok: true });
}
