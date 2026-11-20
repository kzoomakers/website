import { headers } from "next/headers";
import { hit } from "@/lib/limit";
import { getFeedConfig } from "../config";
import { currentFeedUser } from "../identity";
import { QUERY_MAX, hasHit, parseQuery, splitHits } from "../search-rules";
import { COUNT_CAP, MAX_PAGE, search, type Order, type What } from "../models/search";
import { STORIES_PER_PAGE } from "../models/stories";
import { Icon } from "./icons";
import Shell from "./shell";
import { StoryItem, TimeLabel, Divider } from "./story-list";

const Marked = ({ text }: { text: string }) => <>{splitHits(text).map(([t, m], i) => (m ? <mark key={i}>{t}</mark> : t))}</>;
const WHATS: What[] = ["comments", "stories"], ORDERS: Order[] = ["relevance", "newest", "score"];

export default async function SearchPage({ q, what: w, order: o, page }: { q: string; what: string; order: string; page: number }) {
  const what: What = WHATS.includes(w as What) ? (w as What) : "stories", order: Order = ORDERS.includes(o as Order) ? (o as Order) : "relevance";
  const query = q.trim().slice(0, QUERY_MAX), parsed = parseQuery(query), hasQuery = !!(parsed.text || parsed.tags.length || parsed.domains.length || parsed.submitters.length || parsed.commenters.length);
  let r = null, limited = false;
  if (hasQuery) {
    const h = await headers(), ip = h.get("fly-client-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (await hit(`feed:search:${ip}`, 60, 60_000)) r = await search(what, parsed, order, page); else limited = true;
  }
  const [me, cfg] = await Promise.all([currentFeedUser().catch(() => null), getFeedConfig()]);
  const href = (p: number) => `/search?${new URLSearchParams({ q: query, what, order, ...(p > 1 ? { page: String(p) } : {}) })}`;
    const n = r ? (r.count > COUNT_CAP ? `${COUNT_CAP}+` : String(r.count)) : "";
  const chips = [...parsed.tags.map((t) => ["tag", t, `/t/${t}`]), ...parsed.domains.map((t) => ["domain", t, `/domains/${t}`]), ...parsed.submitters.map((t) => ["submitter", t, `/~${t}`]), ...parsed.commenters.map((t) => ["commenter", t, `/~${t}`])];
  return (
    <Shell title={query ? `Search: ${query}` : "Search"} path="/search">
      <div className="search_page">
        <form action="/search" method="get" className="search_form" role="search">
          <div className="search_row">
            <Icon name="search" />
            <input type="search" name="q" defaultValue={query} maxLength={QUERY_MAX} placeholder='Search stories and comments: "exact phrase", -exclude, a OR b, tag:laser' aria-label="Search query" autoComplete="off" autoFocus={!query} />
            <button type="submit">Search</button>
          </div>
          <div className="search_opts">
            <fieldset><legend>Search</legend>{WHATS.slice().reverse().map((x) => <label key={x}><input type="radio" name="what" value={x} defaultChecked={what === x} /> {x === "stories" ? "Stories" : "Comments"}</label>)}</fieldset>
            <fieldset><legend>Order by</legend>{ORDERS.map((x) => <label key={x}><input type="radio" name="order" value={x} defaultChecked={order === x} /> {x[0].toUpperCase() + x.slice(1)}</label>)}</fieldset>
          </div>
          <p className="search_help">Filters: <code>tag:name</code> <code>domain:site.com</code> <code>submitter:user</code> <code>commenter:user</code></p>
        </form>
        {limited && <div className="flash-error" role="alert">Too many searches. Please wait a minute.</div>}
        {r && (
          <section className="search_results" aria-live="polite">
            <p className="search_count"><b>{n}</b> {what === "stories" ? "stories" : "comments"} {r.count === 1 ? "matches" : "match"} {parsed.text && <>“{parsed.text}”</>}{chips.map(([k, v, to]) => <a key={k + v} className="search_chip" href={to}>{k}:{v}</a>)}</p>
            {r.fuzzy && <p className="search_note">Nothing matched exactly, so these match the start of your words.</p>}
            {r.count === 0 && <p className="search_note">No results. Try fewer words, check spelling, or search {what === "stories" ? "comments" : "stories"} instead.</p>}
            {what === "stories" ? (
              <ol className="stories list">{r.stories.map((s, i) => (
                <StoryItem key={s.id} rank={(page - 1) * STORIES_PER_PAGE + i + 1} story={s} newUserDays={cfg.newUserDays}
                  snippet={hasHit(r.snippets.get(String(s.id))) ? <p className="snippet"><Marked text={r.snippets.get(String(s.id))!} /></p> : undefined} />
              ))}</ol>
            ) : (
              <ol className="comment_hits">{r.comments.map((c) => (
                <li key={c.short_id}>
                  <div className="byline"><a href={`/~${c.username}`}>{c.username}</a> on <a href={`/s/${c.story_short_id}`}>{c.story_title}</a><Divider /><a href={`/c/${c.short_id}`}><TimeLabel time={c.created_at} loggedIn={!!me} /></a><Divider />{c.score} point{c.score === 1 ? "" : "s"}</div>
                  <p className="snippet"><Marked text={c.snippet} /></p>
                </li>
              ))}</ol>
            )}
            <nav className="morelink">
              {page > 1 && <a href={href(page - 1)} rel="prev">{`Page ${page - 1}`}</a>}
              {r.more && page < MAX_PAGE && <>{page > 1 && <Divider />}<a href={href(page + 1)} rel="next">{`Page ${page + 1}`}</a></>}
            </nav>
          </section>
        )}
        {!hasQuery && !limited && <p className="search_note">Type words to search every story and comment. Results are ranked by relevance, with word stems matched (cut finds cutting).</p>}
      </div>
    </Shell>
  );
}
