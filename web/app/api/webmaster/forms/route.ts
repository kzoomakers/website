import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { decideMessage, deleteMessage, listMessages, messageCounts } from "@/lib/contact";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";

const deny = () => new NextResponse("not found", { status: 404 });

// GET ?status=held|sent|rejected|all&kind=contact|board
export async function GET(req: Request) {
  if (!(await editingAllowed("forms", "read"))) return deny();
  const q = new URL(req.url).searchParams;
  return NextResponse.json({ messages: await listMessages(q.get("status") || "held", q.get("kind") || undefined), counts: await messageCounts() });
}

// PATCH { id, action: approve | reject | restore }
export async function PATCH(req: Request) {
  if (!(await editingAllowed("forms"))) return deny();
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.id) || !["approve", "reject", "restore"].includes(b?.action)) return new NextResponse("bad request", { status: 400 });
  try {
    const who = await actor();
    await decideMessage(b.id, b.action, who);
    await logAudit(who, "form." + b.action, `message ${b.id}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(errMsg(e), { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await editingAllowed("forms"))) return deny();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deleteMessage(id);
  await logAudit(await actor(), "form.delete", `message ${id}`);
  return NextResponse.json({ ok: true });
}
