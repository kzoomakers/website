// Small pure helpers ported from Lobsters (story.rb title_as_slug, lib/time_ago_in_words.rb). No imports so tests load them directly.

const DROP = new Set(["", "a", "an", "and", "but", "in", "of", "or", "that", "the", "to"]);

/** Rails' String#parameterize: accents folded, anything else but a-z 0-9 - _ becomes "-", runs squeezed, ends trimmed, lowercase. */
const parameterize = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\-_]+/gi, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** story.rb title_as_slug: the title part of /s/abc123/the_title. */
export function titleAsSlug(title: string, maxLen = 35) {
  let wl = 0;
  const words: string[] = [];
  for (const w of parameterize(title).replace(/[^a-z0-9]/g, "_").split("_").filter((x) => !DROP.has(x))) {
    if (wl + w.length <= maxLen) { words.push(w); wl += w.length; }
    else { if (wl === 0) words.push(w.slice(0, maxLen)); break; }
  }
  if (!words.length) words.push("_");
  return words.join("_").replaceAll("_-_", "-");
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
/** lib/time_ago_in_words.rb how_long_ago. */
export function howLongAgo(time: Date, now = new Date()) {
  const s = Math.trunc((now.getTime() - time.getTime()) / 1000);
  if (s <= 5) return "just now";
  if (s < 60) return "less than a minute ago";
  if (s < 3600) return plural(Math.floor(s / 60), "minute");
  if (s < 3600 * 48) return plural(Math.floor(s / 3600), "hour");
  if (s < 86400 * 30) return plural(Math.floor(s / 86400), "day");
  if (s < 86400 * 365) return plural(Math.floor(s / 86400 / 30), "month");
  return plural(Math.floor(s / 86400 / 365), "year");
}

/** Ruby's truncate(text, length:): cut to `n` characters including the "..." when too long. */
export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 3) + "..." : s);

/** Class for the dimmed look of unpopular stories (story.rb negativity_class). */
export const negativityClass = (score: number, flags: number) => { const n = score - flags; return n <= -5 ? "negative_5" : n <= -3 ? "negative_3" : n <= -1 ? "negative_1" : ""; };

/** Server-rendered dates use the makerspace's clock (Lobsters uses Central). The browser script replaces visible times with relative ones anyway. */
export const SITE_ZONE = "America/Detroit";
const PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export function zoned(d: Date) {
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}
