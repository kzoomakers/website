import { NextResponse } from "next/server";
import { deleteMedia, listMedia, setAlt } from "@/lib/media";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";

export async function GET() {
  if (!(await editingAllowed("blog", "read"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await listMedia());
}

export async function PATCH(req: Request) {
  if (!(await editingAllowed("blog"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.id) || typeof b?.alt !== "string") return new NextResponse("bad request", { status: 400 });
  await setAlt(b.id, b.alt);
  await logAudit(await actor(), "media.alt", `media ${b.id}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await editingAllowed("blog"))) return new NextResponse("not found", { status: 404 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deleteMedia(id);
  await logAudit(await actor(), "media.delete", `media ${id}`);
  return NextResponse.json({ ok: true });
}
