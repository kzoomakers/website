import { conn } from "@/lib/db";
import { prefixQuery, type Parsed } from "../search-rules";
import { listBy, UNMERGED, type Story } from "./stories";

export type What = "stories" | "comments";
export type Order = "relevance" | "newest" | "score";
export const COMMENT_HITS_PER_PAGE = 20, COUNT_CAP = 1000, MAX_PAGE = 50;
export type CommentHit = { short_id: string; created_at: Date; score: number; username: string; story_title: string; story_short_id: string; snippet: string };
export type Results = { what: What; count: number; more: boolean; fuzzy: boolean; stories: Story[]; comments: CommentHit[]; snippets: Map<number, string> };

const HEADLINE = "StartSel=⟦, StopSel=⟧, MaxWords=40, MinWords=15, MaxFragments=2, FragmentDelimiter=…";

/** The WHERE conditions for a search, with their parameters numbered after the `skip` that come first (listBy owns $1 limit and $2 offset; a count has none). `fuzzy` swaps the exact text query for a prefix one ("lase" finds "laser"). */
function build(what: What, p: Parsed, order: Order, fuzzy: boolean, skip = 2) {
  const params: unknown[] = [], add = (v: unknown) => (params.push(v), `$${params.length + skip}`), conds: string[] = [];
  const text = fuzzy ? prefixQuery(p.text) : p.text;
  let tsq: string | null = null;
  if (p.text && !text) conds.push("false"); // fuzzy retry with nothing to prefix
  else if (text) { const ph = add(text); tsq = fuzzy ? `to_tsquery('english', ${ph})` : `websearch_to_tsquery('english', ${ph})`; conds.push(`${what === "stories" ? "s.search" : "c.tsv"} @@ ${tsq}`); }
  for (const t of p.tags) conds.push(`EXISTS (SELECT 1 FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = s.id AND lower(t.tag) = ${add(t)})`);
  for (const d of p.domains) conds.push(`lower(d.domain) = ${add(d)}`);
  for (const u of p.submitters) conds.push(`lower(${what === "stories" ? "u" : "su"}.username) = ${add(u)}`);
  for (const u of p.commenters) conds.push(what === "comments" ? `lower(u.username) = ${add(u)}` : `EXISTS (SELECT 1 FROM feed.comments cc JOIN feed.users cu ON cu.id = cc.user_id WHERE cc.story_id = s.id AND NOT cc.is_deleted AND lower(cu.username) = ${add(u)})`);
  const rank = tsq ? `ts_rank(${what === "stories" ? "s.search" : "c.tsv"}, ${tsq})` : null, id = what === "stories" ? "s.id" : "c.id", score = what === "stories" ? "s.score" : "c.score";
  const by = order === "relevance" && rank ? `${rank} DESC, ${id} DESC` : order === "score" ? `${score} DESC, ${id} DESC` : `${id} DESC`;
  return { conds, params, tsq, by };
}

const COMMENT_FROM = `FROM feed.comments c JOIN feed.users u ON u.id = c.user_id JOIN feed.stories s ON s.id = c.story_id JOIN feed.users su ON su.id = s.user_id LEFT JOIN feed.domains d ON d.id = s.domain_id`;
// what a visitor may see: live comments by users in good standing, on stories that are not deleted or (by a banned user) negative and unreviewed
const COMMENT_OK = `NOT c.is_deleted AND NOT c.is_moderated AND u.banned_at IS NULL AND NOT s.is_deleted AND NOT (s.score < 0 AND NOT s.is_moderated AND su.banned_at IS NOT NULL)`;

async function run(what: What, p: Parsed, order: Order, page: number, fuzzy: boolean): Promise<Omit<Results, "fuzzy" | "what">> {
  const b = build(what, p, order, fuzzy), where = b.conds.join(" AND ") || "true", cw = build(what, p, order, fuzzy, 0).conds.join(" AND ") || "true", c = await conn();
  if (what === "stories") {
    const { stories, more } = await listBy({ where: `${UNMERGED} AND ${where}`, order: b.by, params: b.params }, page);
    const snippets = new Map<number, string>();
    if (b.tsq && stories.length) {
      const r = await c.query(`SELECT id, ts_headline('english', description, ${fuzzy ? "to_tsquery" : "websearch_to_tsquery"}('english', $2), '${HEADLINE}') AS h FROM feed.stories WHERE id = ANY($1::bigint[]) AND description IS NOT NULL`, [stories.map((s) => s.id), p.text && (fuzzy ? prefixQuery(p.text) : p.text)]);
      for (const row of r.rows) snippets.set(Number(row.id), row.h);
    }
    const n = (await c.query(`SELECT count(*)::int AS n FROM (SELECT 1 FROM feed.stories s JOIN feed.users u ON u.id = s.user_id LEFT JOIN feed.domains d ON d.id = s.domain_id WHERE ${UNMERGED} AND ${cw} LIMIT ${COUNT_CAP + 1}) x`, b.params)).rows[0].n;
    return { stories, comments: [], snippets, more, count: n };
  }
  const rows = (await c.query(
    `SELECT x.*, ${b.tsq ? `ts_headline('english', x.comment, ${b.tsq}, '${HEADLINE}')` : "left(x.comment, 240)"} AS snippet FROM (
       SELECT c.short_id, c.created_at, c.score, c.comment, u.username, s.title AS story_title, s.short_id AS story_short_id ${COMMENT_FROM}
       WHERE ${COMMENT_OK} AND ${where} ORDER BY ${b.by} LIMIT $1 OFFSET $2) x`, [COMMENT_HITS_PER_PAGE + 1, (page - 1) * COMMENT_HITS_PER_PAGE, ...b.params])).rows;
  const n = (await c.query(`SELECT count(*)::int AS n FROM (SELECT 1 ${COMMENT_FROM} WHERE ${COMMENT_OK} AND ${cw} LIMIT ${COUNT_CAP + 1}) x`, b.params)).rows[0].n;
  return { stories: [], comments: rows.slice(0, COMMENT_HITS_PER_PAGE).map(({ comment: _c, ...r }) => r), snippets: new Map(), more: rows.length > COMMENT_HITS_PER_PAGE, count: n };
}

/** Exact words first; if that finds nothing on page 1, partial words ("lase cut" matches "laser cutter"). */
export async function search(what: What, p: Parsed, order: Order, page: number): Promise<Results> {
  page = Math.min(Math.max(1, page), MAX_PAGE);
  const r = await run(what, p, order, page, false);
  if (r.count === 0 && page === 1 && prefixQuery(p.text)) {
    const f = await run(what, p, order, page, true);
    if (f.count > 0) return { ...f, what, fuzzy: true };
  }
  return { ...r, what, fuzzy: false };
}
