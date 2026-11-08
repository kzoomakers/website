import { getCalUrl } from "./store";
import { debugLog, tracedFetch } from "./debug";

// The calendar page loads its events from this site, not from Google directly. One copy is kept for an hour.
// shortcut: per-process cache, fine for one instance; use a shared cache if the app is ever scaled out.
let cache: { text: string; at: number } | null = null;
let pending: Promise<string | null> | null = null; // one fetch at a time, shared by everyone who asks meanwhile
let retryAt = 0; // after a failed fetch, wait a minute before bothering Google again
let gen = 0; // bumped by resetFeed, so a fetch that was already running for the old address can't put its events back
const TTL = 60 * 60 * 1000, RETRY = 60 * 1000, MAX_AGE = 28 * 24 * 60 * 60 * 1000; // an older copy is no longer served
export const DOWN_MSG = "The calendar has been down a while, contact the administrator.";
/** True when we hold a copy but it is over 4 weeks old (Google has been failing all that time). */
export const downAWhile = () => !!cache && Date.now() - cache.at > MAX_AGE;
const usable = () => (cache && !downAWhile() ? cache.text : null);

export const cachedAt = () => cache?.at ?? null;
/** Forget the copy (the feed address changed, so the old events are the wrong ones). */
export const resetFeed = () => { cache = null; retryAt = 0; gen++; };

async function refresh() {
  const mine = gen;
  try {
    const r = await tracedFetch("calendar-ics", await getCalUrl(), { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Google answered ${r.status}`);
    const text = await r.text();
    if (mine === gen) { cache = { text, at: Date.now() }; retryAt = 0; }
  } catch (e: any) {
    retryAt = Date.now() + RETRY;
    await debugLog("calendar-ics", "calendar feed failed", { error: String(e?.message ?? e), servedStale: !!usable() }, "error");
  }
  return mine === gen ? usable() : null;
}

/** The .ics text, or null when Google can't be reached and there is no older copy.
 *  A failed refresh keeps the older copy and serves it; `force` (the refresh button) skips the age and back-off checks but never throws the old copy away first. */
export function getFeed(force = false): Promise<string | null> {
  if (!force && cache && Date.now() - cache.at <= TTL) return Promise.resolve(cache.text);
  if (!force && Date.now() < retryAt) return Promise.resolve(usable());
  return (pending ??= refresh().finally(() => { pending = null; }));
}
