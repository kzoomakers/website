import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { getFeedConfig } from "../config";
import { INTERVALS, timeInterval } from "../interval";
import { byCategories, byDomain, byOrigin, byTags, byUser, findCategories, findDomain, findOrigin, findTags, findUser, listBy, relatedTags, top, type Banned, type Query, type TagRow } from "../models/stories";
import Shell, { StoriesSubnav } from "./shell";
import { StoryList, TimeLabel } from "./story-list";

const TagLink = ({ t }: { t: Pick<TagRow, "tag" | "description" | "is_media"> }) => <a aria-label={`Tag ${t.tag}`} className={`tag tag_${t.tag}${t.is_media ? " tag_is_media" : ""}`} title={t.description ?? undefined} href={`/t/${t.tag}`}>{t.tag}</a>;
const n = (x: number, w: string) => `${x.toLocaleString("en-US")} ${w}${x === 1 ? "" : "s"}`;

/** Trailing "page/N" of a catch-all, as [rest..., page]; `rest` is what comes before it. */
export function splitPage(seg: string[] = []): { rest: string[]; page: number } {
  const i = seg.length - 2;
  if (i >= 0 && seg[i] === "page") {
    const p = Number(seg[i + 1]);
    if (!Number.isInteger(p) || p < 1 || p > 2 ** 32) notFound();
    return { rest: seg.slice(0, i), page: p };
  }
  return { rest: seg, page: 1 };
}

async function Render({ title, base, page, query, above, below, subnav, h1 }: { title: string; base: string; page: number; query: Query; above?: ReactNode; below?: ReactNode; subnav?: boolean; h1?: boolean }) {
  const [{ stories, more }, cfg] = await Promise.all([listBy(query, page), getFeedConfig()]);
  const path = base + (page > 1 ? `/page/${page}` : "");
  return (
    <Shell title={title} path={path} subnav={subnav ? <StoriesSubnav path={path} /> : undefined}>
      {h1 && <h1 className="">{title}</h1>}
      <StoryList stories={stories} page={page} more={more} base={base} above={above} below={below} newUserDays={cfg.newUserDays} />
    </Shell>
  );
}

const segs = (s: string) => decodeURIComponent(s);

export async function TagPage({ tag, page }: { tag: string; page: number }) {
  const names = segs(tag).split(",");
  const tags = await findTags(names);
  if (!tags) notFound();
  const query = byTags(tags.map((t) => t.id));
  if (tags.length === 1) {
    const t = tags[0], related = await relatedTags(t.id);
    const above = (
      <div className="box"><p>
        Stories <a href={`/tags#${t.tag}`}>tagged</a> as <TagLink t={t} /> {t.description}<br />
        {!!t.hotness_mod && <>Hotness modifier {t.hotness_mod} ({t.hotness_mod > 0 ? "raises" : "lowers"} a story&apos;s rank). </>}
        It takes {t.quorum} user suggestions to add or remove this tag.{" "}
        {t.privileged ? "Only mods can use this tag." : !t.permit_by_new_users ? <>Tag is <a href="/about#new-user-tags">not permitted</a> on stories submitted by new users.</> : null}
      </p>{related.length > 0 && <p>Most often also tagged with {related.map((r) => <span key={r.id}><TagLink t={r} />{" "}</span>)}</p>}</div>
    );
    return <Render title={[t.tag, t.description].filter(Boolean).join(" - ")} base={`/t/${t.tag}`} page={page} query={query} above={above} below={<p className="hint">Tip: read stories across multiple tags with <code>/t/tag1,tag2</code></p>} />;
  }
  const above = <div className="box">Stories <a href="/tags">tagged</a> as<br />{tags.map((t) => <Fragment key={t.id}><TagLink t={t} /> {t.description}<br /></Fragment>)}</div>;
  return <Render title={tags.map((t) => [t.tag, t.description].filter(Boolean).join(" - ")).join(" ")} base={`/t/${tags.map((t) => t.tag).join(",")}`} page={page} query={query} above={above} />;
}

export async function CategoryPage({ category, page }: { category: string; page: number }) {
  const names = segs(category).split(",");
  const cats = await findCategories(names);
  if (!cats) notFound();
  const above = <div className="box">Stories with <a href="/tags">tags</a> in the {cats.map((c) => <Fragment key={c.id}><a href={`/categories/${c.category}`}>{c.category}</a>{" "}</Fragment>)}categories
    {cats.length === 1 && <p className="hint">Tip: read stories across multiple categories with <code>/categories/foo,bar</code></p>}</div>;
  return <Render title={cats.map((c) => c.category).join(" ")} base={`/categories/${cats.map((c) => c.category).join(",")}`} page={page} query={byCategories(cats.map((c) => c.id))} above={above} />;
}

const BannedNote = ({ b }: { b: Banned }) => !b.banned_at ? null : <p>Banned <TimeLabel time={b.banned_at} />{b.banned_by && <> by <a href={`/~${b.banned_by}`}>{b.banned_by}</a>: <em>{b.banned_reason}</em></>}</p>;

export async function DomainPage({ id, page }: { id: string; page: number }) {
  const d = await findDomain(segs(id));
  if (!d) notFound();
  const above = <><p>{d.domain}: {n(d.stories_count, "story").replace("storys", "stories")} from {n(d.n_submitters, "submitter")}{d.n_origins > 0 && <> with <a href={`/domains/${d.domain}/origins`}>{n(d.n_origins, "origin")}</a></>}</p><BannedNote b={d} /></>;
  return <Render title={d.domain} base={`/domains/${d.domain}`} page={page} query={byDomain(d.id)} above={above} />;
}

export async function OriginPage({ identifier, page }: { identifier: string; page: number }) {
  const o = await findOrigin(segs(identifier));
  if (!o) notFound();
  const above = <><p>{o.identifier} (part of <a href={`/domains/${o.domain}`}>{o.domain}</a>): {n(o.stories_count, "story").replace("storys", "stories")} from {n(o.n_submitters, "submitter")}</p><BannedNote b={o} /></>;
  return <Render title={o.identifier} base={`/origins/${o.identifier}`} page={page} query={byOrigin(o.id)} above={above} />;
}

export async function UserStoriesPage({ username, page }: { username: string; page: number }) {
  const u = await findUser(segs(username));
  if (!u) notFound();
  return <Render title={`Newest Stories by ${u.username}`} base={`/~${u.username}/stories`} page={page} query={byUser(u.id)} above={<p>Newest stories submitted by <a href={`/~${u.username}`}>{u.username}</a>.</p>} />;
}

export async function TopPage({ length, page }: { length?: string; page: number }) {
  const iv = timeInterval(length);
  if (iv.placeholder && length !== "1w") return null; // caller redirects
  const hint = <p className="hint" dangerouslySetInnerHTML={{ __html: `You can edit the URL to change the time period like <tt>/5d</tt> or <tt>/2y</tt>; known units are: ${INTERVALS}.` }} />;
  return <Render title={`Top Stories of the Past ${iv.human}`} h1 base={`/top/${iv.param}`} page={page} query={top(iv.n, iv.unit)} subnav below={hint} />;
}
