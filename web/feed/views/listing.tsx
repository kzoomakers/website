import { notFound } from "next/navigation";
import { getFeedConfig } from "../config";
import { currentFeedUser } from "../identity";
import { storyVotes } from "../models/viewer-state";
import { listStories, type Kind } from "../models/stories";
import Shell, { StoriesSubnav } from "./shell";
import { StoryList } from "./story-list";

const TITLE: Record<Kind, string> = { hottest: "", newest: "Newest Stories", active: "Active Discussions", recent: "Recent Stories" };
const BASE: Record<Kind, string> = { hottest: "", newest: "/newest", active: "/active", recent: "/recent" };

/** `seg` is the catch-all after the list's own path: [] or ["page", "2"]. */
export const pageNumber = (seg: string[] = []) => {
  if (!seg.length) return 1;
  const n = Number(seg[1]);
  if (seg.length !== 2 || seg[0] !== "page" || !Number.isInteger(n) || n < 1 || n > 2 ** 32) notFound();
  return n;
};

const TABS: [Kind, string, string][] = [["hottest", "/", "hot"], ["newest", "/newest", "new"], ["active", "/active", "active"], ["recent", "/recent", "recent"]];
const SortTabs = ({ kind }: { kind: Kind }) => (
  <nav className="sorttabs" aria-label="Sort"><span className="sort_label">Sort</span><span className="sort_bar" aria-hidden="true">|</span>{TABS.map(([k, href, label]) => <a key={k} href={href} aria-current={k === kind ? "page" : undefined}>{label}</a>)}<a href="/top">top</a></nav>
);

export default async function Listing({ kind, page }: { kind: Kind; page: number }) {
  const me = await currentFeedUser().catch(() => null);
  const [{ stories, more }, cfg] = await Promise.all([listStories(kind, page, me?.id), getFeedConfig()]);
  const votes = me ? await storyVotes(me.id, stories.map((s) => s.id)) : undefined;
  const path = BASE[kind] + (page > 1 ? `/page/${page}` : "") || "/";
  const above = <><SortTabs kind={kind} />{kind === "active" && <p className="hint">Stories sorted by last comment to foster active discussions</p>}</>;
  const below = kind === "recent" ? <p className="hint">The <a href="/newest">newest</a> stories that have not yet reached the front page.</p> : undefined;
  return (
    <Shell title={TITLE[kind]} path={path} subnav={kind === "hottest" ? undefined : <StoriesSubnav path={path} />}>
      <StoryList stories={stories} page={page} more={more} base={BASE[kind]} above={above} below={below} newUserDays={cfg.newUserDays} me={me} votes={votes} />
    </Shell>
  );
}
