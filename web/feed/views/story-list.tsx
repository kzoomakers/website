import type { Story } from "../models/stories";
import { ActionForm, Upvoter, type Me } from "./controls";
import { howLongAgo, negativityClass, titleAsSlug, truncate, zoned } from "../util";

export const titlePath = (s: Pick<Story, "short_id" | "title">) => `/s/${s.short_id}/${titleAsSlug(s.title)}`;
const at = (d: Date) => { const z = zoned(d); return `${z.date} ${z.time}`; };

export const TimeLabel = ({ time, loggedIn = false }: { time: Date; loggedIn?: boolean }) => (
  <time title={at(time)} dateTime={at(time)} data-at-unix={Math.floor(time.getTime() / 1000)}>{loggedIn ? howLongAgo(time) : at(time)}</time>
);
export const Caches = ({ url }: { url: string }) => (
  <details className="caches" {...{ name: "caches" }}><summary>caches</summary><ul>
    <li><a href={`https://web.archive.org/web/3/${encodeURIComponent(url)}`}>Archive.org</a></li><li><a href={`https://ghostarchive.org/search?term=${encodeURIComponent(url)}`}>Ghostarchive</a></li>
  </ul></details>
);
export const Divider = () => <span aria-hidden="true"> | </span>;

/** users_helper styled_user_link: later rules overwrite earlier ones, so new user beats inactive beats author. `submitter`/`author` come from the story or comment context. */
export function newAria(u: { username: string; user_created_at: Date | null; user_deleted_at: Date | null; user_banned_at: Date | null }, newUserDays: number, role?: "Author" | "Submitter") {
  if (u.user_created_at && u.user_created_at.getTime() > Date.now() - newUserDays * 864e5) return `${u.username} - New user`;
  if (u.user_deleted_at || u.user_banned_at) return `${u.username} - Inactive user`;
  return role ? `${u.username} - ${role}` : undefined;
}
export function UserLink({ s, newUserDays }: { s: Pick<Story, "username" | "user_created_at" | "user_deleted_at" | "user_banned_at" | "user_is_author">; newUserDays: number }) {
  const cls = ["u-author h-card", s.user_is_author && "user_is_author", (s.user_deleted_at || s.user_banned_at) && "inactive_user", s.user_created_at && s.user_created_at.getTime() > Date.now() - newUserDays * 864e5 && "new_user"].filter(Boolean).join(" ");
  return <a className={cls || undefined} aria-label={newAria(s, newUserDays)} href={`/~${s.username}`}>{s.username}</a>;
}

/** stories/_listdetail.html.erb (logged-out). Hide/save/flag/edit controls come with accounts (phase 2/3). */
export function StoryItem({ story: s, newUserDays, me = null, vote = 0, hidden = false }: { story: Story; newUserDays: number; me?: Me | null; vote?: number; hidden?: boolean }) {
  const href = s.url || titlePath(s);
  const referrer = s.merged_story_id == null && Date.now() - s.created_at.getTime() < 3600_000;
  const cls = ["story", negativityClass(s.score, s.flags), vote === 1 && "upvoted", vote === -1 && "flagged"].filter(Boolean).join(" ");
  return (
    <li id={`story_${s.short_id}`} data-shortid={s.short_id} className={cls}>
      <div className="story_liner h-entry">
        <div className="voters"><Upvoter base={`/stories/${s.short_id}`} me={me} voted={vote === 1} score={s.score} own={!!me && me.id === s.user_id} /></div>
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
            {s.url && <><Divider /><Caches url={s.url} /></>}
            <span className="comments_label"><Divider /><a href={titlePath(s)}>{s.comments_count === 0 ? "no comments" : `${s.comments_count} comment${s.comments_count === 1 ? "" : "s"}`}</a></span>
            {me && <><Divider /><ActionForm path={`/stories/${s.short_id}/${hidden ? "unhide" : "hide"}`} me={me} label={hidden ? "unhide" : "hide"} /></>}
          </div>
        </div>
      </div>
      <a href={titlePath(s)} className={`mobile_comments${s.comments_count === 0 ? " zero" : ""}`} style={{ display: "none" }}><span>{s.comments_count}</span></a>
    </li>
  );
}

/** home/index.html.erb: the list plus "Page N" links. `base` is "" for the home page (links are /page/2) or e.g. "/newest". */
export function StoryList({ stories, page, more, base, above, below, newUserDays, me = null, votes, hidden = false }: { stories: Story[]; page: number; more: boolean; base: string; above?: React.ReactNode; below?: React.ReactNode; newUserDays: number; me?: Me | null; votes?: Map<number, number>; hidden?: boolean }) {
  const link = (p: number) => `${base}/page/${p}${base === "/newest" ? "?last_read_timestamp=0" : ""}`; // newest keeps the "Last Read" marker position in the URL; a visitor has none
  return (
    <>
      {above}
      <ol className="stories list">{stories.map((s) => <StoryItem key={s.id} story={s} newUserDays={newUserDays} me={me} vote={votes?.get(s.id) ?? 0} hidden={hidden} />)}</ol>
      {below}
      <nav className="morelink">
        {page > 1 && <a href={link(page - 1)} rel="prev">{`Page ${page - 1}`}</a>}
        {more && <>{page > 1 && <Divider />}<a href={link(page + 1)} rel="next">{`Page ${page + 1}`}</a></>}
      </nav>
    </>
  );
}
