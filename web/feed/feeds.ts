import { commentsByUser, findComment, newestComments } from "./models/comments";
import { byCategories, byDomain, byOrigin, byTags, byUser, findCategories, findDomain, findOrigin, findTags, findUser, kindQuery, listBy, top, type Query } from "./models/stories";
import { findStory, isGone, mergedStories, storyComments } from "./models/story-page";
import { findProfile } from "./models/users";
import { conn } from "@/lib/db";
import { commentJson, commentsRss, storiesRss, storyJson } from "./format";
import { timeInterval } from "./interval";

// The .rss and .json variants of the pages. middleware.ts maps /t/a.rss to /feed-site/rss/t/a and /newest.json to /feed-site/json/newest; this turns those segments into a feed.
export type Fmt = "rss" | "json";
const NOT_FOUND = new Response("not found", { status: 404 });
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** "…/page/N" at the end of the segments. null for a bad page number. */
function paged(segs: string[]): { rest: string[]; page: number } | null {
  const i = segs.length - 2;
  if (i >= 0 && segs[i] === "page") {
    const p = Number(segs[i + 1]);
    return Number.isInteger(p) && p >= 1 && p <= 2 ** 32 ? { rest: segs.slice(0, i), page: p } : null;
  }
  return { rest: segs, page: 1 };
}

/** Which stories a feed lists, and its title; null when the thing does not exist. */
async function storyList(rest: string[]): Promise<{ title: string; query: Query } | null | undefined> {
  const [a, b, c] = rest;
  if (a === "hottest" && rest.length === 1) return { title: "", query: kindQuery("hottest") };
  if (a === "newest" && rest.length === 1) return { title: "Newest Stories", query: kindQuery("newest") };
  if (a === "active" && rest.length === 1) return { title: "Active Discussions", query: kindQuery("active") };
  if (a === "top" && rest.length <= 2) { const iv = timeInterval(b); return iv.placeholder && b !== "1w" && b ? null : { title: `Top Stories of the Past ${iv.human}`, query: top(iv.n, iv.unit) }; }
  if (a === "t" && b && rest.length === 2) { const t = await findTags(decode(b).split(",")); return t && { title: t.map((x) => [x.tag, x.description].filter(Boolean).join(" - ")).join(" "), query: byTags(t.map((x) => x.id)) }; }
  if (a === "categories" && b && rest.length === 2) { const c2 = await findCategories(decode(b).split(",")); return c2 && { title: c2.map((x) => x.category).join(" "), query: byCategories(c2.map((x) => x.id)) }; }
  if (a === "domains" && b && rest.length === 2) { const d = await findDomain(decode(b)); return d && { title: d.domain, query: byDomain(d.id) }; }
  if (a === "origins" && b) { const o = await findOrigin(rest.slice(1).map(decode).join("/")); return o && { title: o.identifier, query: byOrigin(o.id) }; }
  if (a === "u" && b && c === "stories" && rest.length === 3) { const u = await findUser(decode(b)); return u && { title: `Newest Stories by ${u.username}`, query: byUser(u.id) }; }
  return null;
}

const send = (body: string, fmt: Fmt) => new Response(body, { headers: { "content-type": fmt === "rss" ? "application/rss+xml; charset=utf-8" : "application/json; charset=utf-8", "cache-control": "public, max-age=120" } });
const json = (x: unknown) => send(JSON.stringify(x), "json");

export async function handleFeed(fmt: Fmt, segs: string[], origin: string, self: string, domain: string): Promise<Response> {
  const o = origin, pg = paged(segs.length ? segs : ["hottest"]);
  if (!pg) return NOT_FOUND;
  const { rest, page } = pg, [a, b, c] = rest;

  // comments
  if (a === "comments" && rest.length === 1 && fmt === "rss") {
    const { comments } = await newestComments(page);
    return send(commentsRss(o, "Newest Comments", self, domain, comments as never), "rss");
  }
  if (a === "u" && b && c === "comments" && rest.length === 3 && fmt === "rss") {
    const u = await findUser(decode(b));
    return u ? send(commentsRss(o, `Comments for ${u.username}`, self, domain, (await commentsByUser(u.id)) as never), "rss") : NOT_FOUND;
  }
  if (fmt === "json") {
    if (a === "tags" && rest.length === 1) {
      const r = await (await conn()).query("SELECT t.tag, t.description, t.privileged, t.is_media, t.active, t.hotness_mod, c.category FROM feed.tags t JOIN feed.categories c ON c.id = t.category_id ORDER BY t.id");
      return json(r.rows);
    }
    if (a === "c" && b && rest.length === 2) {
      const cm = await findComment(decode(b));
      return cm ? json(commentJson(o, cm as never)) : new Response("can't find comment", { status: 400 });
    }
    if (a === "s" && b) {
      const s = await findStory(decode(b));
      if (!s || isGone(s)) return NOT_FOUND;
      if (s.merged_story_id) {
        const m = (await (await conn()).query("SELECT short_id FROM feed.stories WHERE id = $1", [s.merged_story_id])).rows[0];
        return m ? Response.redirect(`${o}/s/${m.short_id}.json`, 302) : NOT_FOUND;
      }
      const all = [s, ...(await mergedStories(s.id))], cs = await storyComments(all.map((x) => x.id)), short = new Map(cs.map((x) => [x.id, x.short_id]));
      return json(storyJson(o, s, cs.map((x) => commentJson(o, { ...x, parent_short_id: x.parent_comment_id ? short.get(x.parent_comment_id) : null, story_short_id: s.short_id, story_title: s.title }))));
    }
    if (a === "u" && b && rest.length === 2) {
      const u = await findProfile(decode(b));
      if (!u) return NOT_FOUND;
      const active = !u.deleted_at && !u.banned_at, esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return json({ username: u.username, created_at: u.created_at?.toISOString(), is_admin: u.is_admin, is_moderator: u.is_moderator, ...(u.is_admin ? {} : { karma: u.karma }),
        ...(active ? { about: (u.about ?? "").split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p)}</p>\n`).join("") } : {}), invited_by_user: u.invited_by });
    }
  }

  const list = await storyList(rest);
  if (!list) return NOT_FOUND;
  const { stories } = await listBy(list.query, page);
  return fmt === "rss" ? send(storiesRss(o, list.title, self, stories), "rss") : json(stories.map((s) => storyJson(o, s)));
}
