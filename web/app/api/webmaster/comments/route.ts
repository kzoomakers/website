import { NextResponse } from "next/server";
import { allComments, counts, deleteComment, emptySpam, getSettings, saveSettings, setStatus } from "@/lib/comments";
import { baseUrl } from "@/lib/mail";
import { editingAllowed } from "@/lib/guard";

const deny = () => new NextResponse("not found", { status: 404 });

export async function GET(req: Request) {
  if (!(await editingAllowed())) return deny();
  return NextResponse.json({ comments: await allComments(new URL(req.url).searchParams.get("status") || undefined), settings: await getSettings(), counts: await counts() });
}

// PATCH { id, status } moderates one comment; PATCH { settings } saves the moderation settings.
export async function PATCH(req: Request) {
  if (!(await editingAllowed())) return deny();
  const b = await req.json().catch(() => null);
  try {
    if (b?.settings) return NextResponse.json(await saveSettings(b.settings));
    if (!Number.isInteger(b?.id) || typeof b?.status !== "string") return new NextResponse("bad request", { status: 400 });
    await setStatus(b.id, b.status, await baseUrl(req));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}

// DELETE ?id=N removes a comment and its replies; DELETE ?spam=1 empties the spam folder.
export async function DELETE(req: Request) {
  if (!(await editingAllowed())) return deny();
  const q = new URL(req.url).searchParams;
  if (q.get("spam")) return NextResponse.json({ removed: await emptySpam() });
  const id = Number(q.get("id"));
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deleteComment(id);
  return NextResponse.json({ ok: true });
}
