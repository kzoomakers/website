import { getFeedConfig } from "../config";
import type { Comment, StoryFull } from "../models/story-page";
import { isGone } from "../models/story-page";
import { negativityClass } from "../util";
import { CommentItem, html } from "./comment";
import { currentFeedUser } from "../identity";
import { editable } from "../models/submit";
import Shell from "./shell";
import { Caches, Divider, TimeLabel, UserLink, titlePath } from "./story-list";

/** comments/_threads + _thread_to_tree: the flat, depth-first list becomes nested <li class="comments_subtree"><ol class="comments">. */
function Tree({ comments, story, newUserDays }: { comments: Comment[]; story: StoryFull; newUserDays: number }) {
  const kids = new Map<number | null, Comment[]>();
  for (const c of comments) kids.set(c.parent_comment_id, [...(kids.get(c.parent_comment_id) ?? []), c]);
  const render = (parent: number | null): React.ReactNode => (kids.get(parent) ?? []).map((c) => (
    <li className="comments_subtree" key={c.id}><CommentItem c={c} story={story} newUserDays={newUserDays} /><ol className="comments">{render(c.id)}</ol></li>
  ));
  // a reply whose parent is missing (a deleted-and-purged row) still shows, at the top
  const ids = new Set(comments.map((c) => c.id)), orphans = comments.filter((c) => c.parent_comment_id != null && !ids.has(c.parent_comment_id));
  return <ol className="comments" id="story_comments">{render(null)}{orphans.map((c) => <li className="comments_subtree" key={c.id}><CommentItem c={c} story={story} newUserDays={newUserDays} /><ol className="comments">{render(c.id)}</ol></li>)}</ol>;
}

const Tags = ({ s }: { s: StoryFull }) => (
  <ul className="tags" aria-label="Tags">{s.tags.map((t) => <li key={t.tag}><a aria-label={`Tag ${t.tag}`} className={`tag tag_${t.tag}${t.is_media ? " tag_is_media" : ""}`} title={t.description ?? undefined} href={`/t/${t.tag}`}>{t.tag}</a></li>)}</ul>
);
const label = (n: number) => (n === 0 ? "no comment" : `${n} comment${n === 1 ? "" : "s"}`);

/** stories/_singledetail.html.erb */
function Detail({ all, newUserDays }: { all: StoryFull[]; newUserDays: number }) {
  const first = all[0];
  return (
    <li id={`story_${first.short_id}`} data-shortid={first.short_id} className={["story", negativityClass(first.score, first.flags)].filter(Boolean).join(" ")}>
      <div className="story_liner h-entry">
        <div className="voters"><a className="upvoter" href="/login">{first.score}</a></div>
        {all.map((ms) => {
          const referrer = ms.merged_story_id == null && Date.now() - ms.created_at.getTime() < 3600_000;
          return (
            <div className="details" id={`header_${ms.token}`} key={ms.id}>
              <h2 className="link h-cite u-repost-of"><a href={ms.url || titlePath(ms)} rel={`ugc ${referrer ? "" : "noreferrer"}`.trim()} className="u-url">{ms.title}</a></h2>
              {ms.markeddown_description && <a className="description_present" aria-label="Story description" href="#story_text">&#x2636;</a>}
              <Tags s={ms} />
              {ms.origin ? <a className="domain" href={`/origins/${ms.origin}`}>{ms.origin}</a> : ms.domain ? <a className="domain" href={`/domains/${ms.domain}`}>{ms.domain}</a> : null}
              <div className="byline">
                <span>{ms.user_is_author ? "authored by" : "via"}</span> <UserLink s={ms} newUserDays={newUserDays} /> <TimeLabel time={ms.created_at} />
                {ms.url && <><Divider /><Caches url={ms.url} /></>}
                <span className="comments_label"><Divider /><a href={all.length > 1 ? `${titlePath(first)}#comments_${ms.token}` : `#comments-${first.short_id}`}>{label(ms.comments_count)}</a></span>
                {(ms.flags >= 3 || ms.score <= 0) && <span> <Divider />{ms.score} points, {ms.flags} flags </span>}
              </div>
            </div>
          );
        })}
        {all.length > 1 && <div className="details byline"><span className="merge">{all.length} merged</span><span className="comments_label"><Divider />{all.reduce((n, s) => n + s.comments_count, 0) === 0 ? "no comments" : `total: ${all.reduce((n, s) => n + s.comments_count, 0)} comments`}</span></div>}
      </div>
    </li>
  );
}

/** stories/show.html.erb for a visitor. `all` is the story first, then the stories merged into it. */
export default async function StoryPage({ all, comments }: { all: StoryFull[]; comments: Comment[] }) {
  const story = all[0], cfg = await getFeedConfig(), merged = story.stories_count > 0, path = titlePath(story);
  const me = await currentFeedUser().catch(() => null), mine = !!me && editable(story, me.id);
  return (
    <Shell title={story.title} path={path}>
      <ol className="stories"><Detail all={all} newUserDays={cfg.newUserDays} /></ol>
      {mine && me && (
        <p className="story_owner_tools">
          <a href={`/stories/${story.short_id}/edit`}>Edit</a>{" "}
          <form method="post" action={`/stories/${story.short_id}/${story.is_deleted ? "undelete" : "delete"}`} style={{ display: "inline" }}>
            <input type="hidden" name="csrf" value={me.csrf} /><button type="submit">{story.is_deleted ? "Undelete" : "Delete"}</button>
          </form>
        </p>
      )}
      <div className="story_content">{story.markeddown_description && !merged && <div className="story_text" id="story_text" dangerouslySetInnerHTML={html(story.markeddown_description)} />}</div>
      {all.filter((ms) => !isGone(ms)).map((ms) => (
        <div key={ms.id}>
          {merged && <>
            <ol className="stories"><li className="story"><div className="story_liner h-entry"><div className="voters"><span className="merge" /></div>
              <div className="details" id={`comments_${ms.token}`}><h2 className="link h-cite u-repost-of"><a className="u-url" href={ms.url || titlePath(ms)} rel="ugc noreferrer">{ms.title}</a></h2>
                <span className="byline"><span>&nbsp;</span><UserLink s={ms} newUserDays={cfg.newUserDays} />{ms.url && <><Divider /><Caches url={ms.url} /></>}<Divider /><a href={`#comments-${ms.short_id}`}>{label(ms.comments_count).replace("no comment", "no comments")}</a></span></div></div></li></ol>
            <div className="story_content">{ms.markeddown_description && <div className="story_text" dangerouslySetInnerHTML={html(ms.markeddown_description)} />}</div>
          </>}
          <ol className="comments comments1"><li className="comments_subtree" id={`comments-${ms.short_id}`}>
            <Tree comments={comments.filter((c) => c.story_id === ms.id)} story={story} newUserDays={cfg.newUserDays} />
          </li></ol>
          <br />
        </div>
      ))}
    </Shell>
  );
}
