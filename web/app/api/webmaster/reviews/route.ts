import { NextResponse } from "next/server";
import { logAudit } from "@/lib/store";
import { decideReview, deleteReview, listReviews, reviewCounts } from "@/lib/reviews";
import { actor, editingAllowed } from "@/lib/guard";

const deny = () => new NextResponse("not found", { status: 404 });

export async function GET(req: Request) {
  if (!(await editingAllowed("webmaster", "read"))) return deny();
  return NextResponse.json({ reviews: await listReviews(new URL(req.url).searchParams.get("status") || "pending"), counts: await reviewCounts() });
}

// PATCH { id, action: save | approve | reject | restore, name?, role?, text? }
export async function PATCH(req: Request) {
  if (!(await editingAllowed("webmaster"))) return deny();
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.id) || !["save", "approve", "reject", "restore"].includes(b?.action)) return new NextResponse("bad request", { status: 400 });
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  try {
    await decideReview(b.id, b.action, { name: s(b.name), role: s(b.role), text: s(b.text) }, await actor());
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await editingAllowed("webmaster"))) return deny();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deleteReview(id);
  await logAudit(await actor(), "review.delete", `submission ${id}`);
  return NextResponse.json({ ok: true });
}
