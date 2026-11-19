import { notFound } from "next/navigation";
import { getFeedConfig } from "../config";
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

export default async function Listing({ kind, page }: { kind: Kind; page: number }) {
  const [{ stories, more }, cfg] = await Promise.all([listStories(kind, page), getFeedConfig()]);
  const path = BASE[kind] + (page > 1 ? `/page/${page}` : "") || "/";
  const above = kind === "active" ? <p className="hint">Stories sorted by last comment to foster active discussions</p> : undefined;
  const below = kind === "recent" ? <p className="hint">The <a href="/newest">newest</a> stories that have not yet reached the front page.</p> : undefined;
  return (
    <Shell title={TITLE[kind]} path={path} subnav={kind === "hottest" ? undefined : <StoriesSubnav path={path} />}>
      <StoryList stories={stories} page={page} more={more} base={BASE[kind]} above={above} below={below} newUserDays={cfg.newUserDays} />
    </Shell>
  );
}
