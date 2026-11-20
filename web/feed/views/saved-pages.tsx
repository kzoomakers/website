import { notFound, redirect } from "next/navigation";
import { getFeedConfig } from "../config";
import { currentFeedUser } from "../identity";
import { hiddenBy, listBy, savedBy, upvotedBy } from "../models/stories";
import { upvotedComments } from "../models/comments";
import { commentVotes, storyVotes } from "../models/viewer-state";
import { CommentItem } from "./comment";
import Shell from "./shell";
import { Divider, StoryList } from "./story-list";

export type SavedKind = "hidden" | "saved" | "upvoted-stories" | "upvoted-comments";
const META: Record<SavedKind, { title: string; base: string }> = {
  hidden: { title: "Hidden Stories", base: "/hidden" },
  saved: { title: "Saved Stories", base: "/saved" },
  "upvoted-stories": { title: "Upvoted Stories", base: "/upvoted/stories" },
  "upvoted-comments": { title: "Upvoted Comments", base: "/upvoted/comments" },
};
const TABS: [SavedKind, string][] = [["saved", "Saved"], ["upvoted-stories", "Upvoted Stories"], ["upvoted-comments", "Upvoted Comments"], ["hidden", "Hidden"]];

/** saved/_subnav.html.erb */
const Subnav = ({ kind }: { kind: SavedKind }) => <>{TABS.map(([k, label], i) => <li key={k} className={i === 0 ? "push-right" : undefined}><a href={META[k].base} aria-current={k === kind ? "page" : undefined}>{label}</a></li>)}</>;

/** home#hidden, #saved, #upvoted and comments#upvoted: signed-in only (require_logged_in_user). */
export default async function SavedPage({ kind, page }: { kind: SavedKind; page: number }) {
  const { title, base } = META[kind], path = base + (page > 1 ? `/page/${page}` : "");
  const me = await currentFeedUser().catch(() => null);
  if (!me?.username) redirect(`/login?return=${base}`);
  const cfg = await getFeedConfig();
  const link = (p: number) => `${base}/page/${p}`;
  if (kind === "upvoted-comments") {
    const { comments, more } = await upvotedComments(me.id, page);
    if (page > 1 && !comments.length) notFound();
    const votes = await commentVotes(me.id, comments.map((c) => c.id));
    return (
      <Shell title={title} path={path} subnav={<Subnav kind={kind} />}>
        <h1>{title}</h1>
        <ol className="comments comments1">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentItem c={c} story={{ id: c.story_id, user_id: c.story_user_id!, user_is_author: !!c.story_user_is_author }} newUserDays={cfg.newUserDays} showStory me={me} votes={votes} />
              <ol className="comments" />
            </li>
          ))}
        </ol>
        <nav className="morelink">
          {page > 1 && <a href={link(page - 1)} rel="prev">{`Page ${page - 1}`}</a>}
          {more && <>{page > 1 && <Divider />}<a href={link(page + 1)} rel="next">{`Page ${page + 1}`}</a></>}
        </nav>
      </Shell>
    );
  }
  const q = kind === "hidden" ? hiddenBy(me.id) : kind === "saved" ? savedBy(me.id) : upvotedBy(me.id);
  const { stories, more } = await listBy(q, page); // no viewerId: this is the list of stories they hid, so don't drop those
  if (page > 1 && !stories.length) notFound();
  const votes = await storyVotes(me.id, stories.map((s) => s.id));
  return (
    <Shell title={title} path={path} subnav={<Subnav kind={kind} />}>
      <StoryList stories={stories} page={page} more={more} base={base} newUserDays={cfg.newUserDays} me={me} votes={votes} hidden={kind === "hidden"} />
    </Shell>
  );
}
