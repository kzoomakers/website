import { NextResponse } from "next/server";
import { decideMessage, deleteMessage, listMessages, messageCounts } from "@/lib/contact";
import { actor, editingAllowed } from "@/lib/guard";

const deny = () => new NextResponse("not found", { status: 404 });

// GET ?status=held|sent|rejected|all&kind=contact|board
export async function GET(req: Request) {
  if (!(await editingAllowed())) return deny();
  const q = new URL(req.url).searchParams;
  return NextResponse.json({ messages: await listMessages(q.get("status") || "held", q.get("kind") || undefined), counts: await messageCounts() });
}

// PATCH { id, action: approve | reject | restore }
export async function PATCH(req: Request) {
  if (!(await editingAllowed())) return deny();
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.id) || !["approve", "reject", "restore"].includes(b?.action)) return new NextResponse("bad request", { status: 400 });
  try {
    await decideMessage(b.id, b.action, await actor());
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await editingAllowed())) return deny();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deleteMessage(id);
  return NextResponse.json({ ok: true });
}
