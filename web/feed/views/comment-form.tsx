import { notFound, redirect } from "next/navigation";
import { conn } from "@/lib/db";
import { MAX_DEPTH, isEditable } from "../comment-rules";
import { takeCommentFlash } from "../flash";
import { currentFeedUser } from "../identity";
import { wearableHats, type WearableHat } from "../models/hats";
import { html } from "./comment";
import Shell from "./shell";

/** The comment box: used under a story (top-level), on the reply page and on the edit page. */
export function CommentBox({ action, csrf, label, text = "", errors = [], storyShortId, parentShortId, hats = [], hat }: { action: string; csrf: string; label: string; hats?: WearableHat[]; hat?: string; text?: string; errors?: string[]; storyShortId?: string; parentShortId?: string }) {
  return (
    <form method="post" action={action} className="comment_form">
      {errors.length > 0 && <div className="flash-error" role="alert"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      <input type="hidden" name="csrf" value={csrf} />
      {storyShortId && <input type="hidden" name="story" value={storyShortId} />}
      {parentShortId && <input type="hidden" name="parent" value={parentShortId} />}
      <textarea name="comment" rows={5} required maxLength={65535} defaultValue={text} aria-label="Comment" />
      {hats.length > 0 && <div className="hats"><label htmlFor="hat">Put on hat:</label> <select id="hat" name="hat" defaultValue={hat ?? ""}><option value="">None</option>{hats.map((h) => <option key={h.short_id} value={h.short_id}>{h.hat}</option>)}</select></div>}
      <p><input type="submit" value={label} /> <span className="help">Markdown is supported. Be kind.</span></p>
    </form>
  );
}

const load = async (shortId: string) => (await (await conn()).query(
  `SELECT c.id, c.short_id, c.comment, c.markeddown_comment, c.depth, c.user_id, c.is_deleted, c.is_moderated, c.last_edited_at, (SELECT short_id FROM feed.hats WHERE id = c.hat_id) AS hat_short_id, u.username, s.short_id AS story_short_id, s.title
   FROM feed.comments c JOIN feed.users u ON u.id = c.user_id JOIN feed.stories s ON s.id = c.story_id WHERE c.short_id = $1`, [shortId])).rows[0];

export async function ReplyPage({ shortId }: { shortId: string }) {
  const v = await currentFeedUser().catch(() => null), path = `/c/${shortId}/reply`;
  if (!v) redirect(`/login?return=${path}`);
  if (!v.username) redirect(`/login/username?return=${path}`);
  const c = await load(shortId);
  if (!c || c.is_deleted || c.is_moderated || c.depth >= MAX_DEPTH) notFound();
  const f = takeCommentFlash(v.id);
  return (
    <Shell title="Reply" path={path}>
      <div className="box wide">
        <p>Replying to <a href={`/~${c.username}`}>{c.username}</a> on <a href={`/s/${c.story_short_id}`}>{c.title}</a>:</p>
        <blockquote dangerouslySetInnerHTML={html(c.markeddown_comment)} />
        <CommentBox action={`/stories/${c.story_short_id}/comment`} csrf={v.csrf} label="Post reply" text={f?.text} errors={f?.errors} hats={await wearableHats(v.id)} storyShortId={c.story_short_id} parentShortId={shortId} />
      </div>
    </Shell>
  );
}

export async function EditCommentPage({ shortId }: { shortId: string }) {
  const v = await currentFeedUser().catch(() => null), path = `/c/${shortId}/edit`;
  if (!v) redirect(`/login?return=${path}`);
  const c = await load(shortId);
  if (!c || !isEditable(c, v.id)) notFound();
  const f = takeCommentFlash(v.id);
  return (
    <Shell title="Edit Comment" path={path}>
      <div className="box wide"><CommentBox action={`/c/${shortId}/update`} csrf={v.csrf} label="Save" text={f?.text ?? c.comment} errors={f?.errors} hats={await wearableHats(v.id)} hat={c.hat_short_id ?? undefined} /></div>
    </Shell>
  );
}
