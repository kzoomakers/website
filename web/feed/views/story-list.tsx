import type { Story } from "../models/stories";
import { howLongAgo, negativityClass, titleAsSlug, truncate } from "../util";

export const titlePath = (s: Pick<Story, "short_id" | "title">) => `/s/${s.short_id}/${titleAsSlug(s.title)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const at = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

export const TimeLabel = ({ time, loggedIn = false }: { time: Date; loggedIn?: boolean }) => (
  <time title={at(time)} dateTime={at(time)} data-at-unix={Math.floor(time.getTime() / 1000)}>{loggedIn ? howLongAgo(time) : at(time)}</time>
);
export const Divider = () => <span aria-hidden="true"> | </span>;

export function UserLink({ s, newUserDays }: { s: Pick<Story, "username" | "user_created_at" | "user_deleted_at" | "user_banned_at" | "user_is_author">; newUserDays: number }) {
  const cls = [s.user_is_author && "user_is_author", (s.user_deleted_at || s.user_banned_at) && "inactive_user", s.user_created_at && s.user_created_at.getTime() > Date.now() - newUserDays * 864e5 && "new_user"].filter(Boolean).join(" ");
  return <a className={cls || undefined} href={`/~${s.username}`}>{s.username}</a>;
}

/** stories/_listdetail.html.erb (logged-out). Hide/save/flag/edit controls come with accounts (phase 2/3). */
export function StoryItem({ story: s, newUserDays }: { story: Story; newUserDays: number }) {
  const href = s.url || titlePath(s);
  const referrer = s.merged_story_id == null && Date.now() - s.created_at.getTime() < 3600_000;
  const cls = ["story", negativityClass(s.score, s.flags)].filter(Boolean).join(" ");
  return (
    <li id={`story_${s.short_id}`} data-shortid={s.short_id} className={cls}>
      <div className="story_liner h-entry">
        <div className="voters"><a className="upvoter" href="/login">{s.score}</a></div>
        <div className="details">
          <h2 className="link h-cite u-repost-of"><a className="u-url" href={href} rel={`ugc ${referrer ? "" : "noreferrer"}`.trim()}>{s.title}</a></h2>
          {s.stories_count > 0 ? <span className="merge" role="img" aria-label={`${s.stories_count + 1} stories merged`}>{s.stories_count + 1}</span> : s.merged_story_id ? <span className="merge">merged</span> : null}
          {s.markeddown_description && <a aria-label={`Description text for: ${s.title}`} className="description_present" title={truncate(s.description ?? "", 500)} href={titlePath(s)}>&#x2636;</a>}
          <ul className="tags" aria-label="Tags">
            {s.tags.map((t) => <li key={t.tag}><a aria-label={`Tag ${t.tag}`} className={`tag tag_${t.tag}${t.is_media ? " tag_is_media" : ""}`} title={t.description ?? undefined} href={`/t/${t.tag}`}>{t.tag}</a></li>)}
          </ul>
          {s.origin ? <a className="domain" href={`/origins/${s.origin}`}>{s.origin}</a> : s.domain ? <a className="domain" href={`/domains/${s.domain}`}>{s.domain}</a> : null}
          <div className="byline">
            <span> {s.user_is_author ? "authored by" : "via"} </span>
            <UserLink s={s} newUserDays={newUserDays} /> <TimeLabel time={s.created_at} />
            <span className="comments_label"><Divider /><a href={titlePath(s)}>{s.comments_count === 0 ? "no comments" : `${s.comments_count} comment${s.comments_count === 1 ? "" : "s"}`}</a></span>
          </div>
        </div>
      </div>
      <a href={titlePath(s)} className={`mobile_comments${s.comments_count === 0 ? " zero" : ""}`} style={{ display: "none" }}><span>{s.comments_count}</span></a>
    </li>
  );
}

/** home/index.html.erb: the list plus "Page N" links. `base` is "" for the home page (links are /page/2) or e.g. "/newest". */
export function StoryList({ stories, page, more, base, above, below, newUserDays }: { stories: Story[]; page: number; more: boolean; base: string; above?: React.ReactNode; below?: React.ReactNode; newUserDays: number }) {
  const link = (p: number) => `${base}/page/${p}`;
  return (
    <>
      {above}
      <ol className="stories list">{stories.map((s) => <StoryItem key={s.id} story={s} newUserDays={newUserDays} />)}</ol>
      {below}
      <nav className="morelink">
        {page > 1 && <a href={link(page - 1)} rel="prev">Page {page - 1}</a>}
        {more && <>{page > 1 && <Divider />}<a href={link(page + 1)} rel="next">Page {page + 1}</a></>}
      </nav>
    </>
  );
}
