import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putCommentFlash, putError, putFlash } from "@/feed/flash";
import { createComment } from "@/feed/models/comment-write";
import { modMergeStory, modSetStoryDeleted, modUpdateStory } from "@/feed/models/mod";
import { markStory } from "@/feed/models/hide-save";
import { castVote } from "@/feed/models/vote";
import { suggest } from "@/feed/models/suggestions";
import { setStoryDeleted, updateStory, type Submission } from "@/feed/models/submit";
import { hit } from "@/lib/limit";
import { readSubmission } from "../../form";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const to = (path: string) => NextResponse.redirect(feedOrigin() + path, { status: 303, headers: H });

// stories#update, #destroy and #undelete (Lobsters uses PATCH/DELETE; these are POSTs so the same-site and CSRF checks cover every change).
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!/^[a-z0-9]{1,10}$/.test(id) || !["update", "delete", "undelete", "comment", "upvote", "unvote", "flag", "hide", "unhide", "save", "unsave", "mod-delete", "mod-undelete", "mod-merge", "suggest"].includes(action)) return new NextResponse("not found", { status: 404 });
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  try {
    if (action === "upvote" || action === "unvote" || action === "flag") {
      if (!(await hit(`feed:vote:${v.id}`, 300, 3_600_000, true))) return new NextResponse("too many votes", { status: 429 });
      if (action === "flag" && !(await hit(`feed:flag:${v.id}`, 20, 3_600_000, true))) return new NextResponse("too many flags", { status: 429 }); // flag spam is the abuse votes alone don't catch
      const r = await castVote(v, "story", id, action === "upvote" ? 1 : action === "flag" ? -1 : 0, String(f.get("reason") ?? "").slice(0, 1));
      if (!r.ok) putError(v.id, `Couldn't do that: ${r.error}.`);
      return to(`/s/${id}`);
    }
    if (action === "hide" || action === "unhide" || action === "save" || action === "unsave") {
      const r = await markStory(v, id, action);
      if (!r.ok) putError(v.id, `Couldn't do that: ${r.error}.`);
      return to(`/s/${id}`);
    }
    if (action === "mod-delete" || action === "mod-undelete") {
      const r = await modSetStoryDeleted(v, id, action === "mod-delete", String(f.get("reason") ?? ""));
      if (!r.ok) putError(v.id, `Couldn't do that: ${r.error}.`);
      return to(`/s/${id}`);
    }
    if (action === "mod-merge") { // an empty target unmerges
      const r = await modMergeStory(v, id, String(f.get("target") ?? "").trim().slice(0, 10), String(f.get("reason") ?? ""));
      if (!r.ok) putError(v.id, `Couldn't do that: ${r.error}.`);
      return to(`/s/${id}`);
    }
    if (action === "suggest") {
      if (!(await hit(`feed:suggest:${v.id}`, 20, 3_600_000, true))) { putError(v.id, "You're suggesting too fast. Please wait a bit."); return to(`/s/${id}`); }
      const r = await suggest(v, id, { title: String(f.get("title") ?? "").slice(0, 400), tags: f.getAll("tags").map((t) => String(t).slice(0, 25)).slice(0, 30) });
      if (!r.ok) { putError(v.id, r.errors.join(" ")); return to(`/stories/${id}/suggest`); }
      putError(v.id, r.applied ? "Your suggestion reached quorum and the story was updated." : r.changed ? "Your suggested changes have been noted." : "That matches the story as it is, so there is nothing to suggest.", true);
      return to(`/s/${id}`);
    }
    if (action === "comment") {
      const text = String(f.get("comment") ?? "").slice(0, 70_000), parent = String(f.get("parent") ?? "").slice(0, 10) || undefined;
      if (!(await hit(`feed:comment:${v.id}`, 30, 3_600_000, true))) { putCommentFlash(v.id, { text, errors: ["You're commenting too fast. Please wait a bit."] }); return to(parent ? `/c/${parent}/reply` : `/s/${id}#comment_form`); }
      const r = await createComment(v, { storyShortId: id, parentShortId: parent, comment: text, hat: String(f.get("hat") ?? "").slice(0, 10) });
      if (r.ok) return to(`/c/${r.shortId}`);
      putCommentFlash(v.id, { text, errors: r.errors });
      return to(parent ? `/c/${parent}/reply` : `/s/${id}#comment_form`);
    }
    if (action === "update") {
      const input: Submission = readSubmission(f);
      const r = v.isModerator && f.get("reason") !== null ? await modUpdateStory(v, id, input, String(f.get("reason")).slice(0, 4000)) : await updateStory(v, id, input);
      if (r.ok) return to(`/s/${id}`);
      putFlash(v.id, { input, errors: r.errors });
      return to(`/stories/${id}/edit`);
    }
    const r = await setStoryDeleted(v, id, action === "delete");
    return to(r.ok ? `/s/${id}` : "/");
  } catch (e) { console.error("feed story:", action, e); putError(v.id, "Something went wrong. Please try again."); return to(`/s/${id}`); }
}
