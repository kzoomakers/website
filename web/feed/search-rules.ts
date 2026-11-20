// Search query parsing, pure so tests load it directly. The text part goes to Postgres websearch_to_tsquery (quotes, OR and -exclude work there, and it never errors on odd input);
// tag:, domain:, submitter: and commenter: tokens are pulled out first, as Lobsters does.
export type Parsed = { text: string; tags: string[]; domains: string[]; submitters: string[]; commenters: string[] };
export const QUERY_MAX = 200;
const FILTER = /^(tag|domain|submitter|commenter):(.+)$/i;
const clean = (v: string) => v.replace(/[^\w.~-]/g, "").slice(0, 60).toLowerCase();

export function parseQuery(raw: string): Parsed {
  const out: Parsed = { text: "", tags: [], domains: [], submitters: [], commenters: [] }, rest: string[] = [];
  for (const tok of raw.slice(0, QUERY_MAX).match(/"[^"]*"|\S+/g) ?? []) {
    const m = FILTER.exec(tok), v = m && clean(m[2]);
    if (!m || !v) { rest.push(tok); continue; }
    const k = m[1].toLowerCase();
    (k === "tag" ? out.tags : k === "domain" ? out.domains : k === "submitter" ? out.submitters : out.commenters).push(v);
  }
  out.text = rest.join(" ").trim();
  return out;
}

/** "lase cut" -> "lase:* & cut:*", for when the exact search finds nothing. Null when the text uses search syntax (quotes, OR, -) or has no usable words. */
export function prefixQuery(text: string): string | null {
  if (/["\-]|\bOR\b/.test(text)) return null;
  const words = (text.match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 8).map((w) => w.slice(0, 40));
  return words.length ? words.map((w) => `${w}:*`).join(" & ") : null;
}

/** ts_headline output marks hits with ⟦ ⟧; this splits it into plain and highlighted pieces (the caller renders them as text, so nothing in a comment can inject HTML). */
export const splitHits = (s: string): [string, boolean][] => s.split(/(⟦[^⟧]*⟧)/).filter(Boolean).map((p) => (p.startsWith("⟦") && p.endsWith("⟧") ? [p.slice(1, -1), true] : [p, false]));
export const hasHit = (s: string | null | undefined) => !!s && s.includes("⟦");
