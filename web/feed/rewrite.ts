// Maps a public Lobsters-style URL on the feed host to the internal route tree under /feed-site. Pure (no imports) so middleware and tests can load it.
// Next dynamic segments span a whole segment, so "/~alice" can't be a route; ".rss"/".json" variants are route handlers under /feed-site/rss and /feed-site/json.

export const FEED_PREFIX = "/feed-site";
export type Rewrite = { pass: true } | { rewrite: string } | { redirect: string; status: 301 | 302 };

const pass = (p: string) => /^\/(feed\/|_next\/|favicon\.ico$|robots\.txt$|sitemap)/.test(p); // static files the feed shares with the host app

/** Legacy URLs Lobsters redirects (routes.rb). Returns the target path or null. */
function legacy(p: string): string | null {
  let m: RegExpMatchArray | null;
  if (p === "/u") return "/users";
  if ((m = p.match(/^\/u\/([^/]+)\/standing$/))) return `/~${m[1]}/standing`;
  if ((m = p.match(/^\/u\/([^/]+)$/)) || (m = p.match(/^\/@([^/]+)$/))) return `/~${m[1]}`;
  if ((m = p.match(/^\/newest\/([^/]+)\/page\/(\d+)$/))) return `/~${m[1]}/stories/page/${m[2]}`;
  if ((m = p.match(/^\/newest\/([^/]+)$/))) return `/~${m[1]}/stories`;
  if ((m = p.match(/^\/threads\/([^/]+)$/))) return `/~${m[1]}/threads`;
  if (/^\/replies\/(unread)(\/page\/\d+)?$/.test(p)) return "/inbox/unread";
  if (/^\/replies(\/(comments|stories))?(\/page\/\d+)?$/.test(p)) return "/inbox/all";
  if (p === "/top/rss") return "/top.rss";
  if ((m = p.match(/^\/top\/([^/]+)\/rss$/))) return `/top/${m[1]}.rss`;
  if (p === "/comments/rss") return "/comments.rss";
  if (p === "/upvoted") return "/upvoted/stories";
  if ((m = p.match(/^\/upvoted\/page\/(\d+)$/))) return `/upvoted/stories/page/${m[1]}`;
  if ((m = p.match(/^\/domain\/(.+)$/))) return `/domains/${m[1]}`;
  if ((m = p.match(/^\/domains\/([^/]+)\/([^/]+)$/)) && m[2] !== "origins") return `/origins/${m[1]}/${m[2]}`;
  if (p === "/mod/notes" || /^\/mod\/notes\/[^/]+$/.test(p)) return "/mod";
  return null;
}

export function feedRewrite(pathname: string): Rewrite | null {
  let p = pathname.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (p === FEED_PREFIX || p.startsWith(FEED_PREFIX + "/")) return null; // never reachable by its internal name
  if (pass(p)) return { pass: true };
  const to = legacy(p);
  if (to) return { redirect: to, status: 301 };
  const fmt = p.match(/\.(rss|json)$/);
  const base = fmt ? p.slice(0, -fmt[0].length) : p;
  const user = base.match(/^\/~([^/]+)(\/.*)?$/); // /~alice/stories -> /u/alice/stories
  const inner = user ? `/u/${user[1]}${user[2] ?? ""}` : base === "/" ? "" : base;
  if (base === "/" && fmt) return { rewrite: `${FEED_PREFIX}/${fmt[1]}/hottest` }; // "/.rss" is not a thing; /rss and /hottest are listed below
  if (p === "/rss") return { rewrite: `${FEED_PREFIX}/rss/hottest` };
  if (p === "/hottest") return { rewrite: `${FEED_PREFIX}/json/hottest` };
  return { rewrite: `${FEED_PREFIX}${fmt ? "/" + fmt[1] : ""}${inner}` };
}
