import { cleanHtml } from "@/lib/sanitize";
import { titleAsSlug } from "./util";

const clean = (h: string | null) => (h == null ? null : cleanHtml(h)); // stored HTML is ours, but it is cleaned again on the way out

// RSS 2.0 and JSON shapes, matching Lobsters' stories.rss.builder, comments/*.rss.builder and the models' as_json: scripts and feed readers depend on the exact names. No database access.
export const SITE_NAME = "Kzoo Makers Talk";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rfc822 = (d: Date) => d.toUTCString().replace("GMT", "+0000");

export type StoryRow = { short_id: string; title: string; url: string | null; created_at: Date; score: number; flags: number; comments_count: number; description: string | null; markeddown_description: string | null; username: string; user_is_author: boolean; domain: string | null; tags: { tag: string }[] };
export type CommentRow = { short_id: string; story_short_id?: string; story_title?: string; created_at: Date; last_edited_at: Date; is_deleted: boolean; is_moderated: boolean; score: number; flags: number; parent_short_id?: string | null; comment: string; markeddown_comment: string | null; depth: number; username: string; user_banned_at: Date | null; moderator?: string | null; mod_reason?: string | null };

export const titleUrl = (o: string, s: Pick<StoryRow, "short_id" | "title">) => `${o}/s/${s.short_id}/${titleAsSlug(s.title)}`;
const shortUrl = (o: string, s: Pick<StoryRow, "short_id">) => `${o}/s/${s.short_id}`;
const goneText = (c: CommentRow) => c.is_moderated ? `Comment removed by moderator ${c.moderator ?? ""}: ${c.mod_reason ?? "No reason given"}` : c.user_banned_at ? "Comment from banned user removed" : "Comment removed by its author";
const iso = (d: Date) => d.toISOString();

/** story.rb as_json */
export function storyJson(o: string, s: StoryRow, comments?: unknown[]) {
  const j: Record<string, unknown> = {
    short_id: s.short_id, created_at: iso(s.created_at), title: s.title, url: s.url ?? "", score: s.score, flags: s.flags, comment_count: s.comments_count,
    description: clean(s.markeddown_description), description_plain: s.description, submitter_user: s.username, user_is_author: s.user_is_author, tags: s.tags.map((t) => t.tag).sort(),
  };
  if (comments) j.comments = comments;
  j.short_id_url = shortUrl(o, s); j.comments_url = titleUrl(o, s);
  return j;
}

/** comment.rb as_json. `story` is the story the comment is shown under (the one it was merged into, if any). */
export function commentJson(o: string, c: CommentRow & { story_short_id: string; story_title: string }) {
  const gone = c.is_deleted || c.is_moderated;
  return {
    short_id: c.short_id, created_at: iso(c.created_at), last_edited_at: iso(c.last_edited_at), is_deleted: c.is_deleted, is_moderated: c.is_moderated, score: c.score, flags: c.flags,
    parent_comment: c.parent_short_id ?? null, comment: gone ? `<em>${esc(goneText(c))}</em>` : clean(c.markeddown_comment), comment_plain: gone ? goneText(c) : c.comment, depth: c.depth, commenting_user: c.username,
    short_id_url: `${o}/c/${c.short_id}`, url: `${titleUrl(o, { short_id: c.story_short_id, title: c.story_title })}#c_${c.short_id}`,
  };
}

const head = (o: string, title: string, self: string, pub: Date | null) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME + (title ? `: ${title}` : ""))}</title>
    <link>${esc(o + "/")}</link>
    <atom:link href="${esc(self)}" rel="self"/>
    <description>${esc(title)}</description>
${pub ? `    <pubDate>${rfc822(pub)}</pubDate>\n` : ""}    <ttl>120</ttl>
`;

/** home/stories.rss.builder */
export function storiesRss(o: string, title: string, self: string, stories: StoryRow[]) {
  const items = stories.map((s) => {
    const link = s.url || titleUrl(o, s);
    let d = clean(s.markeddown_description) ?? "";
    if (s.url) d += `<p><a href="${esc(titleUrl(o, s))}">Comments</a></p>`;
    return `    <item>
      <title>${esc(s.title)}</title>
      <link>${esc(link)}</link>
      <guid>${esc(shortUrl(o, s))}</guid>
      <author>${esc(`${s.domain ?? ""} ${s.user_is_author ? "by" : "via"} ${s.username}`)}</author>
      <pubDate>${rfc822(s.created_at)}</pubDate>
      <comments>${esc(titleUrl(o, s))}</comments>
      <description>${esc(d)}</description>
${s.tags.map((t) => `      <category>${esc(t.tag)}</category>\n`).join("")}    </item>
`;
  });
  return head(o, title, self, stories[0]?.created_at ?? null) + items.join("") + "  </channel>\n</rss>\n";
}

/** comments/index.rss.builder and user_comments.rss.builder */
export function commentsRss(o: string, title: string, self: string, domain: string, comments: (CommentRow & { story_short_id: string; story_title: string })[]) {
  const items = comments.map((c) => {
    const link = `${o}/c/${c.short_id}`;
    return `    <item>
      <title>${esc(c.story_title)}</title>
      <link>${esc(link)}</link>
      <guid>${esc(link)}</guid>
      <author>${esc(`${c.username}@${domain} (${c.username})`)}</author>
      <pubDate>${rfc822(c.last_edited_at)}</pubDate>
      <comments>${esc(link)}</comments>
      <description>${esc(c.is_deleted || c.is_moderated ? esc(goneText(c)) : clean(c.markeddown_comment))}</description>
    </item>
`;
  });
  return head(o, title, self, comments[0]?.created_at ?? new Date()) + items.join("") + "  </channel>\n</rss>\n";
}
