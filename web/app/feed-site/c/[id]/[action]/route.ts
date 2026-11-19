import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putCommentFlash } from "@/feed/flash";
import { setCommentDeleted, updateComment } from "@/feed/models/comment-write";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const to = (path: string) => NextResponse.redirect(feedOrigin() + path, { status: 303, headers: H });

// comments#update, #destroy and #undelete as POSTs, so the same-site and CSRF checks cover every change.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!/^[a-z0-9]{1,10}$/.test(id) || !["update", "delete", "undelete"].includes(action)) return new NextResponse("not found", { status: 404 });
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  try {
    if (action === "update") {
      const text = String(f.get("comment") ?? "").slice(0, 70_000), r = await updateComment(v, id, text);
      if (r.ok) return to(`/c/${id}`);
      putCommentFlash(v.id, { text, errors: r.errors });
      return to(`/c/${id}/edit`);
    }
    const r = await setCommentDeleted(v, id, action === "delete");
    return to(r.ok ? `/c/${id}` : "/");
  } catch (e) { console.error("feed comment:", action, e); return to("/"); }
}
