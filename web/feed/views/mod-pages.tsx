import { notFound, redirect } from "next/navigation";
import { getFeedConfig } from "../config";
import { currentFeedUser } from "../identity";
import { flaggedCommenters, flaggedComments, modActivity, sinceArgs } from "../models/mod-dash";
import { listBy } from "../models/stories";
import { commentVotes, storyVotes } from "../models/viewer-state";
import { CommentItem, html } from "./comment";
import { stamp, Target } from "./moderations-page";
import Shell from "./shell";
import { Divider, StoryItem } from "./story-list";

const SECTIONS = [
  { label: "F-Stories", seg: "flagged_stories", periods: ["1d", "2d", "3d", "1w", "1m"], def: "2d" },
  { label: "F-Comments", seg: "flagged_comments", periods: ["1d", "2d", "3d", "1w", "1m"], def: "2d" },
  { label: "Commenters", seg: "commenters", periods: ["1m", "2m", "3m", "6m"], def: "1m" },
] as const;

/** mod/_subnav.html.erb. Hotspots are phase 5. */
const Subnav = ({ seg, period }: { seg?: string; period?: string }) => (
  <>
    <li className="push-right"><a href="/mod" aria-current={!seg ? "page" : undefined}>Activity</a></li>
    {SECTIONS.map((s) => <li key={s.seg}>{s.seg === seg ? <>{s.label}: {s.periods.map((p) => <span key={p}><a href={`/mod/${s.seg}/${p}`} aria-current={p === period ? "page" : undefined}>{p}</a> </span>)}</> : <a href={`/mod/${s.seg}/${s.def}`}>{s.label}</a>}</li>)}
  </>
);

// require_logged_in_moderator
async function moderator(path: string) {
  const v = await currentFeedUser().catch(() => null);
  if (!v?.username) redirect(`/login?return=${path}`);
  if (!v.isModerator) notFound();
  return v;
}
const Empty = () => <div className="nominal">🦞</div>;
const Pager = ({ base, page, more }: { base: string; page: number; more: boolean }) => (
  <nav className="morelink">
    {page > 1 && <a href={`${base}?page=${page - 1}`} rel="prev">{`Page ${page - 1}`}</a>}
    {more && <>{page > 1 && <Divider />}<a href={`${base}?page=${page + 1}`} rel="next">{`Page ${page + 1}`}</a></>}
  </nav>
);

/** mod/activities/index.html.erb */
export async function ModActivityPage() {
  await moderator("/mod");
  const items = await modActivity();
  return (
    <Shell title="Mod Activity last 3 months" path="/mod" subnav={<Subnav />}>
      <h1>Mod Activity last 3 months</h1>
      <section>
        <ul className="mod_activities">
          {items.map((a, i) => a.kind === "moderation" ? (
            <li key={i} className="moderation">
              <div className="byline">Public Log {stamp(a.at)} {a.m.moderator ? <a href={`/~${a.m.moderator}`}>{a.m.moderator}</a> : a.m.is_from_suggestions ? <em>(Users)</em> : <em>System</em>} | <span className="target"><Target m={a.m} /></span></div>
              <p>Action: {a.m.action}{a.m.reason && <><br />Reason: {a.m.reason}</>}</p>
            </li>
          ) : a.kind === "note" ? (
            <li key={i} className="mod_note">
              <div className="byline">Note <a href={`/~${a.user}`}>{a.user}</a> {stamp(a.at)}{a.moderator && <> {a.moderator}</>}</div>
              <div dangerouslySetInnerHTML={html(a.html)} />
            </li>
          ) : (
            <li key={i} className="mod_mail">
              <div className="byline">Mail {stamp(a.at)} | <a href={`/mod/mails/${a.short_id}`}>{a.subject}</a> ({a.messages} {a.messages === 1 ? "Message" : "Messages"})
                <div>Recipients: {a.recipients.map((r) => <span key={r}><a href={`/~${r}`}>{r}</a> </span>)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}

/** mod/flagged#flagged_stories: unmerged stories with more than one flag. */
export async function FlaggedStoriesPage({ period, page }: { period: string; page: number }) {
  const path = `/mod/flagged_stories/${period}`, me = await moderator(path);
  const [{ stories, more }, cfg] = await Promise.all([
    listBy({ where: "s.flags > 1 AND s.merged_story_id IS NULL AND s.created_at >= now() - ($3::int * ('1 ' || $4)::interval)", order: "s.id DESC", params: sinceArgs(period) }, page), getFeedConfig()]);
  if (page > 1 && !stories.length) notFound();
  const votes = await storyVotes(me.id, stories.map((s) => s.id));
  return (
    <Shell title="Flagged Stories" path={path} subnav={<Subnav seg="flagged_stories" period={period} />}>
      <h1>Flagged Stories</h1>
      {stories.length ? <ol className="stories list">{stories.map((s) => <StoryItem key={s.id} story={s} newUserDays={cfg.newUserDays} me={me} vote={votes.get(s.id) ?? 0} />)}</ol> : <Empty />}
      <Pager base={path} page={page} more={more} />
    </Shell>
  );
}

/** mod/flagged#flagged_comments */
export async function FlaggedCommentsPage({ period, page }: { period: string; page: number }) {
  const path = `/mod/flagged_comments/${period}`, me = await moderator(path);
  const [{ comments, more }, cfg] = await Promise.all([flaggedComments(period, page), getFeedConfig()]);
  if (page > 1 && !comments.length) notFound();
  const votes = await commentVotes(me.id, comments.map((c) => c.id));
  return (
    <Shell title="Flagged Comments" path={path} subnav={<Subnav seg="flagged_comments" period={period} />}>
      <h1>Flagged Comments</h1>
      {comments.length ? (
        <ol className="comments comments1">
          {comments.map((c) => <li key={c.id}><CommentItem c={c} story={{ id: c.story_id, user_id: c.story_user_id!, user_is_author: !!c.story_user_is_author }} newUserDays={cfg.newUserDays} showStory me={me} votes={votes} /></li>)}
        </ol>
      ) : <Empty />}
      <Pager base={path} page={page} more={more} />
    </Shell>
  );
}

/** mod/flagged#commenters */
export async function CommentersPage({ period }: { period: string }) {
  const path = `/mod/commenters/${period}`;
  await moderator(path);
  const { agg, commenters } = await flaggedCommenters(period);
  return (
    <Shell title="Flagged Commenters" path={path} subnav={<Subnav seg="commenters" period={period} />}>
      <h1>Flagged Commenters</h1>
      {commenters.length ? (
        <table className="data zebra" style={{ margin: "0 auto" }}>
          <tbody>
            <tr><th>User</th><th title="Number of standard deviations above average commenter">+σ</th><th className="r" title="Flags per comment">D/C</th><th className="r" title="total # of comment flags"># FV</th><th className="r" title="total # of flagged comments"># C</th><th className="r" title="(percentage of all of users's comments)">% C</th></tr>
            {commenters.map((u) => (
              <tr key={u.username} id={u.username}>
                <td><a href={`/~${u.username}`}>{u.username}</a> <small>(<a href={`/~${u.username}/threads`}>threads</a>)</small></td>
                <td className="r">{u.sigma.toFixed(1)}</td><td className="r">{u.average_flags.toFixed(1)}</td><td className="r">{u.n_flags}</td><td className="r">{u.n_comments}</td><td className="r">{Math.round(u.percent_flagged)}%</td>
              </tr>
            ))}
            <tr>
              <td title="Average of commenters, including the most-flagged commenters above">Avg of {agg.n_commenters} commenters</td>
              <td className="r" title="0 by definition; () is standard deviation">(σ = {agg.stddev.toFixed(1)})</td>
              <td className="r">{agg.avg.toFixed(1)}</td><td className="r">{Math.round(agg.avg * agg.n_comments)}</td><td className="r">{agg.n_comments.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      ) : <Empty />}
    </Shell>
  );
}
