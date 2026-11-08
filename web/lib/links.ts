import { db } from "./db";

// External link clicks: any http(s) link that leaves kzoomakers.org. Two tables: link_daily is a counter per link per day and is kept forever (it is tiny);
// link_clicks has the detail of each click (when, IP, user agent, screen, page it was on) and is kept for DETAIL_DAYS.
export const OWN = /(^|\.)kzoomakers\.org$/i;
/** Short names for /go?l=… (old redirect pages): these are the only places /go will ever send anyone, so it can't be used as an open redirect. */
export const DETAIL_DAYS = 180;
// The Discord invite is also written in data/globals/navbar.json and data/globals/footer.json (page data can't import this): change all three together.
export const GO: Record<string, string> = { discord: "https://discord.gg/4jmJ32QyuF" };

let ready: Promise<unknown> | undefined;
async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= (async () => {
    const p = d.pool;
    await p.query("CREATE TABLE IF NOT EXISTS link_daily (url text NOT NULL, day date NOT NULL, n int NOT NULL DEFAULT 0, PRIMARY KEY (url, day))");
    await p.query(`CREATE TABLE IF NOT EXISTS link_clicks (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), url text NOT NULL, host text NOT NULL, ip text NOT NULL DEFAULT '', ua text NOT NULL DEFAULT '',
      screen text NOT NULL DEFAULT '', page text NOT NULL DEFAULT '')`);
    await p.query("CREATE INDEX IF NOT EXISTS link_clicks_url ON link_clicks (url, at DESC)");
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}

const cut = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

/** Counts one click. Returns false (and records nothing) unless `url` is an http(s) link away from kzoomakers.org. */
export async function recordClick(url: unknown, c: { ip: string; ua: string; screen?: unknown; page?: unknown }) {
  let u: URL;
  try { u = new URL(cut(url, 2000)); } catch { return false; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || OWN.test(u.hostname)) return false;
  u.hash = ""; // #anchors are the same link
  const p = await pool(), key = u.toString();
  await p.query("INSERT INTO link_daily (url, day, n) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1) ON CONFLICT (url, day) DO UPDATE SET n = link_daily.n + 1", [key]);
  await p.query("INSERT INTO link_clicks (url, host, ip, ua, screen, page) VALUES ($1, $2, $3, $4, $5, $6)", [key, u.hostname.toLowerCase(), cut(c.ip, 100), cut(c.ua, 1000), cut(c.screen, 40), cut(c.page, 500)]);
  if (Math.random() < 0.01) await p.query("DELETE FROM link_clicks WHERE at < now() - make_interval(days => $1)", [DETAIL_DAYS]).catch(() => {});
  return true;
}

/** Every link with its totals, newest-clicked first. */
export async function summary() {
  const p = await pool();
  return (await p.query(`SELECT d.url, sum(d.n)::int total, sum(d.n) FILTER (WHERE d.day >= current_date - 6)::int d7, sum(d.n) FILTER (WHERE d.day >= current_date - 29)::int d30, min(d.day) first_day,
    (SELECT max(at) FROM link_clicks c WHERE c.url = d.url) last_at FROM link_daily d GROUP BY d.url ORDER BY last_at DESC NULLS LAST LIMIT 500`)).rows;
}

/** One link: clicks per day (all time) and the latest 100 clicks. */
export async function detail(url: string) {
  const p = await pool();
  const [days, clicks] = await Promise.all([
    p.query("SELECT day, n FROM link_daily WHERE url = $1 ORDER BY day", [url]),
    p.query("SELECT at, ip, ua, screen, page FROM link_clicks WHERE url = $1 ORDER BY at DESC LIMIT 100", [url]),
  ]);
  return { days: days.rows, clicks: clicks.rows };
}
