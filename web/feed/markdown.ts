// Port of Lobsters' extras/markdowner.rb: CommonMark + GFM autolink/strikethrough, raw HTML escaped, headings become <strong>, links get rel=ugc, @user / ~user mentions linked.
import MarkdownIt from "markdown-it";
import { load } from "cheerio";
import { cleanHtml } from "@/lib/sanitize";

/** username_attribute.rb VALID_USERNAME */
export const USERNAME = "[A-Za-z0-9][A-Za-z0-9_-]{0,24}";
const MENTION = new RegExp(`\\B([@~]${USERNAME})\\b`, "g");

/** Names mentioned in `text` (lowercase, no sigil), so the caller can look them all up in one query and pass the hits to renderMarkdown. */
export const mentionedUsers = (text: string) => [...new Set([...text.matchAll(MENTION)].map((m) => m[1].slice(1).toLowerCase()))];

type Tok = { type: string; content: string; level: number; attrs: [string, string][] | null; children: Tok[] | null; attrSet(k: string, v: string): void };

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });
// linkify: true has quadratic paths on huge input (see its advisories), so callers must cap length first (MAX_MARKDOWN).
export const MAX_MARKDOWN = 65_535;

const mentions: Parameters<typeof md.core.ruler.after>[2] = (state) => {
  const known: Set<string> = (state.env as { users?: Set<string> }).users ?? new Set();
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    const out: typeof block.children = [];
    let inLink = 0;
    for (const t of block.children as unknown as Tok[]) {
      if (t.type === "link_open") inLink++;
      if (t.type === "link_close") inLink--;
      if (t.type !== "text" || inLink || !MENTION.test(t.content)) { out.push(t as never); continue; }
      MENTION.lastIndex = 0;
      let last = 0;
      for (const m of t.content.matchAll(MENTION)) {
        const name = m[1].slice(1).toLowerCase();
        if (!known.has(name)) continue;
        const push = (type: string, content = "", attrs?: [string, string][]) => { const n = new state.Token(type, type === "text" ? "" : "a", type === "link_open" ? 1 : type === "link_close" ? -1 : 0); n.content = content; if (attrs) n.attrs = attrs; out.push(n as never); };
        if (m.index! > last) push("text", t.content.slice(last, m.index));
        push("link_open", "", [["href", `/~${name}`]]); push("text", m[1]); push("link_close");
        last = m.index! + m[0].length;
      }
      if (last === 0) out.push(t as never);
      else if (last < t.content.length) { const n = new state.Token("text", "", 0); n.content = t.content.slice(last); out.push(n as never); }
    }
    block.children = out;
  }
};
md.core.ruler.after("linkify", "feed_mentions", mentions);

/** Markdowner.to_html. `users` = lowercase usernames that existed at the post date (look up with mentionedUsers). Images only render when allowImages, else they become links to the image. */
export function renderMarkdown(text: string, o: { allowImages?: boolean; users?: Set<string> } = {}) {
  if (!text?.trim()) return "";
  if (text.length > MAX_MARKDOWN) text = text.slice(0, MAX_MARKDOWN);
  const $ = load(md.render(text, { users: o.users ?? new Set() }), null, false);
  $("h1,h2,h3,h4,h5,h6").each((_, el) => { (el as { name: string }).name = "strong"; });
  if (!o.allowImages) $("img").each((_, el) => { const i = $(el), href = i.attr("src") ?? ""; i.replaceWith($("<a>").attr("href", href).text(i.attr("title") || i.attr("alt") || href)); });
  $("a").attr("rel", "ugc nofollow");
  return cleanHtml($.html());
}
