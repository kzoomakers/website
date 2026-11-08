import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { allComments, counts, deleteComment, emptySpam, getSettings, saveSettings, setStatus } from "@/lib/comments";
import { baseUrl } from "@/lib/mail";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";

const deny = () => new NextResponse("not found", { status: 404 });

export async function GET(req: Request) {
  if (!(await editingAllowed("blog", "read"))) return deny();
  return NextResponse.json({ comments: await allComments(new URL(req.url).searchParams.get("status") || undefined), settings: await getSettings(), counts: await counts() });
}

// PATCH { id, status } moderates one comment; PATCH { settings } saves the moderation settings.
export async function PATCH(req: Request) {
  if (!(await editingAllowed("blog"))) return deny();
  const b = await req.json().catch(() => null);
  try {
    if (b?.settings) { const r = await saveSettings(b.settings); await logAudit(await actor(), "comment.settings"); return NextResponse.json(r); }
    if (!Number.isInteger(b?.id) || typeof b?.status !== "string") return new NextResponse("bad request", { status: 400 });
    await setStatus(b.id, b.status, await baseUrl(req));
    await logAudit(await actor(), "comment." + b.status, `comment ${b.id}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(errMsg(e), { status: 400 });
  }
}

// DELETE ?id=N removes a comment and its replies; DELETE ?spam=1 empties the spam folder.
export async function DELETE(req: Request) {
  if (!(await editingAllowed("blog"))) return deny();
  const q = new URL(req.url).searchParams;
  if (q.get("spam")) { const removed = await emptySpam(); await logAudit(await actor(), "comment.empty_spam", `${removed} removed`); return NextResponse.json({ removed }); }
  const id = Number(q.get("id"));
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deleteComment(id);
  await logAudit(await actor(), "comment.delete", `comment ${id}`);
  return NextResponse.json({ ok: true });
}
