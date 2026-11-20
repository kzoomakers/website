import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putCommentFlash, putFlash } from "@/feed/flash";
import { createComment } from "@/feed/models/comment-write";
import { modSetStoryDeleted } from "@/feed/models/mod";
import { markStory } from "@/feed/models/hide-save";
import { castVote } from "@/feed/models/vote";
import { setStoryDeleted, updateStory, type Submission } from "@/feed/models/submit";
import { hit } from "@/lib/limit";
import { readSubmission } from "../../form";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const to = (path: string) => NextResponse.redirect(feedOrigin() + path, { status: 303, headers: H });

// stories#update, #destroy and #undelete (Lobsters uses PATCH/DELETE; these are POSTs so the same-site and CSRF checks cover every change).
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!/^[a-z0-9]{1,10}$/.test(id) || !["update", "delete", "undelete", "comment", "upvote", "unvote", "flag", "hide", "unhide", "save", "unsave", "mod-delete", "mod-undelete"].includes(action)) return new NextResponse("not found", { status: 404 });
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  try {
    if (action === "upvote" || action === "unvote" || action === "flag") {
      if (!(await hit(`feed:vote:${v.id}`, 300, 3_600_000, true))) return new NextResponse("too many votes", { status: 429 });
      await castVote(v, "story", id, action === "upvote" ? 1 : action === "flag" ? -1 : 0, String(f.get("reason") ?? "").slice(0, 1));
      return to(`/s/${id}`);
    }
    if (action === "hide" || action === "unhide" || action === "save" || action === "unsave") {
      await markStory(v, id, action);
      return to(`/s/${id}`);
    }
    if (action === "mod-delete" || action === "mod-undelete") {
      await modSetStoryDeleted(v, id, action === "mod-delete", String(f.get("reason") ?? ""));
      return to(`/s/${id}`);
    }
    if (action === "comment") {
      const text = String(f.get("comment") ?? "").slice(0, 70_000), parent = String(f.get("parent") ?? "").slice(0, 10) || undefined;
      if (!(await hit(`feed:comment:${v.id}`, 30, 3_600_000, true))) { putCommentFlash(v.id, { text, errors: ["You're commenting too fast. Please wait a bit."] }); return to(parent ? `/c/${parent}/reply` : `/s/${id}#comment_form`); }
      const r = await createComment(v, { storyShortId: id, parentShortId: parent, comment: text });
      if (r.ok) return to(`/c/${r.shortId}`);
      putCommentFlash(v.id, { text, errors: r.errors });
      return to(parent ? `/c/${parent}/reply` : `/s/${id}#comment_form`);
    }
    if (action === "update") {
      const input: Submission = readSubmission(f);
      const r = await updateStory(v, id, input);
      if (r.ok) return to(`/s/${id}`);
      putFlash(v.id, { input, errors: r.errors });
      return to(`/stories/${id}/edit`);
    }
    const r = await setStoryDeleted(v, id, action === "delete");
    return to(r.ok ? `/s/${id}` : "/");
  } catch (e) { console.error("feed story:", action, e); return to("/"); }
}
