import { createSign } from "crypto";
import { db } from "./db";
import { openText, sealText } from "./vault";
import { classify } from "./referrers-util";
import { TZ } from "./tours-fmt";

// Optional Google Analytics: a tracking tag for the public site plus a report page for staff (Admin > Website > Analytics).
// Settings live in the settings table (key "ga:config", service-account key sealed). Reports come from the GA4 Data API over plain fetch and are cached 60 minutes in the same table.
export const CACHE_MS = 60 * 60_000;
export const RANGES = [7, 30, 90] as const;
type Cfg = { enabled: boolean; banner: boolean; measurementId: string; propertyId: string; searchConsoleSite: string; credentials: string }; // banner: ask visitors to accept cookies (off = nobody is asked and analytics start for everyone)
type Key = { client_email: string; private_key: string };

async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}
export const read = async (key: string) => (await (await pool()).query("SELECT data FROM settings WHERE key = $1", [key])).rows[0]?.data;
export const write = async (key: string, data: unknown) => void (await (await pool()).query("INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [key, JSON.stringify(data)]));
export const load = async (): Promise<Cfg> => ({ enabled: false, banner: true, measurementId: "", propertyId: "", searchConsoleSite: "", credentials: "", ...(await read("ga:config")) });

/** Checks and unpacks a pasted service-account key. */
export function parseKey(text: string): Key {
  let k: any;
  try { k = JSON.parse(text); } catch { throw new Error("That is not valid JSON. Paste the whole key file."); }
  if (k?.type !== "service_account" || typeof k.client_email !== "string" || typeof k.private_key !== "string") throw new Error("That is not a service-account key file.");
  return { client_email: k.client_email, private_key: k.private_key };
}

/** For the settings screen: never the key itself, only who it belongs to. */
export async function adminView() {
  const c = await load();
  let email = "";
  try { if (c.credentials) email = parseKey(openText(c.credentials)).client_email; } catch { /* unreadable key shows as not set */ }
  return { enabled: c.enabled, banner: c.banner, measurementId: c.measurementId, propertyId: c.propertyId, searchConsoleSite: c.searchConsoleSite, serviceAccount: email };
}

/** credentials: undefined or "" keeps the saved key, "-" removes it, anything else replaces it. */
export async function save(a: { enabled: unknown; banner?: unknown; measurementId: unknown; propertyId: unknown; searchConsoleSite?: unknown; credentials?: unknown }) {
  const c = await load(), mid = String(a.measurementId ?? "").trim(), pid = String(a.propertyId ?? "").trim(), cred = String(a.credentials ?? "").trim();
  if (mid && !/^G-[A-Z0-9]{4,20}$/.test(mid)) throw new Error("The Measurement ID looks like G-XXXXXXXXXX.");
  if (pid && !/^\d{4,15}$/.test(pid)) throw new Error("The Property ID is a number (GA4 Admin > Property details).");
  const site = String(a.searchConsoleSite ?? "").trim();
  if (site && !/^(sc-domain:[A-Za-z0-9.-]+|https?:\/\/\S+)$/.test(site)) throw new Error("The Search Console site looks like sc-domain:example.org or https://example.org/ (copy it exactly as Search Console lists it).");
  if (cred && cred !== "-") parseKey(cred);
  if (a.enabled && !mid) throw new Error("Add the Measurement ID before turning Google Analytics on.");
  const next: Cfg = { enabled: !!a.enabled, banner: a.banner !== false, measurementId: mid, propertyId: pid, searchConsoleSite: site, credentials: cred === "-" ? "" : cred ? sealText(cred) : c.credentials };
  await write("ga:config", next);
  await (await pool()).query("DELETE FROM settings WHERE key LIKE 'ga:cache%'"); // new property or key: old numbers no longer apply
  tokens.clear(); tagMemo = undefined;
}

let tagMemo: { at: number; v: { id: string; banner: boolean } } | undefined; // the tag endpoint is public: remember the answer for a minute so visitors and bots don't each cost a query (per machine; save() clears it here, other machines catch up within the minute)
/** What the public pages need: the Measurement ID ("" when the feature is off) and whether to show the cookie notice. Safe to expose. */
export async function publicTag() {
  if (tagMemo && Date.now() - tagMemo.at < 60_000) return tagMemo.v;
  try { const c = await load(); tagMemo = { at: Date.now(), v: { id: c.enabled ? c.measurementId : "", banner: c.banner } }; } catch { return { id: "", banner: true }; }
  return tagMemo.v;
}

const tokens = new Map<string, { value: string; exp: number }>(); // one login per scope (Analytics, Search Console)
const SCOPES = { analytics: "https://www.googleapis.com/auth/analytics.readonly", searchConsole: "https://www.googleapis.com/auth/webmasters.readonly" };
const b64 = (x: object | Buffer) => Buffer.from(x instanceof Buffer ? x : JSON.stringify(x)).toString("base64url");

/** Signed service-account login (RFC 7523): trades a short-lived JWT for an access token. */
export async function accessToken(k: Key, scope: keyof typeof SCOPES = "analytics") {
  const hit = tokens.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.value;
  const now = Math.floor(Date.now() / 1000), head = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: k.client_email, scope: SCOPES[scope], aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const jwt = head + "." + createSign("RSA-SHA256").update(head).sign(k.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }), signal: AbortSignal.timeout(15_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google refused the service-account key" + (j.error_description ? `: ${j.error_description}` : "."));
  tokens.set(scope, { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token as string;
}

async function api(c: Cfg, method: "runReport" | "batchRunReports" | "runRealtimeReport", body: object): Promise<any> {
  if (!c.propertyId || !c.credentials) throw new Error("Add the Property ID and service-account key in Admin > Setup > Google Analytics first.");
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${c.propertyId}:${method}`, {
    method: "POST", headers: { authorization: "Bearer " + (await accessToken(parseKey(openText(c.credentials)))), "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? "Google says this service account may not read the property. Add its email as a Viewer in GA4 > Admin > Property access management." : `Google Analytics error: ${j.error?.message ?? r.status}`);
  return j;
}

/** Asks for one day of one metric, to prove the Property ID and key work together. */
export async function test() {
  await api(await load(), "runReport", { dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }], metrics: [{ name: "activeUsers" }] });
}

type R = { metadata?: { timeZone?: string }; rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };
const rows = (r: R): any[][] => (r.rows ?? []).map((x) => [...(x.dimensionValues ?? []).map((v) => v.value), ...(x.metricValues ?? []).map((v) => Number(v.value))]);

/** Google leaves out days with no activity; put them back as zeros so the chart has one bar per day. The range ends on Google's own last day, because its days follow the property's time zone, not ours. */
function fill(days: number, got: { d: string; users: number; views: number; sessions: number }[]) {
  if (!got.length) return got;
  const m = new Map(got.map((x) => [x.d, x])), end = Date.parse(got.at(-1)!.d + "T00:00:00Z");
  for (let i = days - 1; i >= 0; i--) { const d = new Date(end - i * 864e5).toISOString().slice(0, 10); if (!m.has(d)) m.set(d, { d, users: 0, views: 0, sessions: 0 }); }
  return [...m.values()].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-days);
}

/** Offset of `zone` from UTC at an instant, in ms. */
const offset = (t: number, zone: string) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(t).map((x) => [x.type, +x.value])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; };

/** GA labels hours with the property's wall clock ("2026110121" = 21:00 there). Turn each into the real moment, then count by hour and weekday in the site's zone (TZ). Second pass on the offset handles hours next to a clock change. */
export function byLocalTime(r: any[][], propertyZone = TZ) {
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0)), hourly = Array<number>(24).fill(0), names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const [dh, v] of r) {
    const k = String(dh), guess = Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10));
    const t = guess - offset(guess - offset(guess, propertyZone), propertyZone);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "numeric", weekday: "short" }).formatToParts(t).map((x) => [x.type, x.value]));
    hourly[+p.hour] += Number(v); heat[names.indexOf(p.weekday)][+p.hour] += Number(v);
  }
  return { hourly, heat };
}

/** Turns the five GA4 answers into what the page draws. Pure, so it can be tested without Google. */
export function shape(days: number, r: R[], extra: R[] = []) {
  const [daily, totals, pages, sources, countries] = r;
  const [devices, browsers, systems, landing, cities, channels, visitorType, events, dateHours, sourceDaily] = extra;
  const tot = (i: number) => { const t = rows(totals).find((x) => x[0] === `date_range_${i}`)?.slice(1) ?? []; return [0, 1, 2, 3, 4, 5].map((k) => t[k] ?? 0); };
  const [users, views, engagement, duration, sessions, newUsers] = tot(0), prev = tot(1);
  const list = <K extends string>(x: R | undefined, key: K) => rows(x ?? {}).map(([a, b]) => ({ [key]: String(a), n: Number(b) }) as { [P in K]: string } & { n: number });
  const { hourly, heat } = byLocalTime(rows(dateHours ?? {}), dateHours?.metadata?.timeZone);
  const kinds: Record<string, number> = {}, bySource = rows(sources).map(([s, n]) => {
    const name = String(s), kind = name === "(direct)" || name === "(not set)" ? "direct" : classify(`https://${name}/`, name, "")?.kind ?? "other";
    kinds[kind] = (kinds[kind] ?? 0) + Number(n);
    return { source: name, kind, sessions: Number(n) };
  });
  const series = fill(days, rows(daily).map(([d, u, v, s]) => ({ d: `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`, users: u, views: v, sessions: s ?? 0 })));
  const at = new Map(series.map((x, i) => [x.d, i])), trend = bySource.slice(0, 5).map((s) => ({ source: s.source, vals: Array<number>(series.length).fill(0) })); // the five biggest sources, one value per day
  rows(sourceDaily ?? {}).forEach(([d, src, v]) => { const t = trend.find((x) => x.source === src), i = at.get(`${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`); if (t && i !== undefined) t.vals[i] += Number(v); });
  return {
    days, users, views, engagement, duration, sessions, newUsers, prev: { users: prev[0], views: prev[1], engagement: prev[2], duration: prev[3], sessions: prev[4] },
    daily: series, trend,
    pages: rows(pages).map(([p, n]) => ({ page: String(p), views: Number(n) })),
    sources: bySource, kinds,
    countries: rows(countries).map(([c, n]) => ({ country: String(c), users: Number(n) })),
    devices: list(devices, "name"), browsers: list(browsers, "name"), systems: list(systems, "name"), landing: list(landing, "page"), cities: list(cities, "name"),
    channels: list(channels, "name"), visitorType: list(visitorType, "name"), events: list(events, "name"),
    hourly, heat, zone: daily?.metadata?.timeZone ?? dateHours?.metadata?.timeZone ?? TZ, // sessions per hour of day and per weekday x hour (heat[0] = Sunday) in the site time zone; zone = the property's own time zone, which Google's days follow
  };
}
export type Report = ReturnType<typeof shape>;

type Cached = { at: number; report: Report; k?: string };
export type Served = Cached & { stale: boolean; error?: string };
/** Fresh copy if it is under an hour old; otherwise ask Google; if Google fails, the old copy (stale: true) rather than nothing. */
export async function cached(hit: Cached | undefined, fetchFresh: () => Promise<Cached>, now = Date.now()): Promise<Served> {
  if (hit && now - hit.at < CACHE_MS) return { ...hit, stale: false };
  try { return { ...(await fetchFresh()), stale: false }; }
  catch (e) { if (hit) return { ...hit, stale: true, error: e instanceof Error ? e.message : String(e) }; throw e; }
}

const inflight = new Map<string, ReturnType<typeof cached>>(); // many admins at once share one call to Google
export type Range = { days: number } | { from: string; to: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Number of days in a custom range, or null when it is malformed, backwards, in the future or over a year. */
export function span(r: { from: string; to: string }, now = Date.now()) {
  if (!DAY.test(r.from) || !DAY.test(r.to)) return null;
  const a = Date.parse(r.from + "T00:00:00Z"), b = Date.parse(r.to + "T00:00:00Z");
  return a <= b && b <= now && b - a < 366 * 864e5 ? (b - a) / 864e5 + 1 : null;
}
/** Start (inclusive) and end (exclusive) of a range as moments, for things that live in our own database. Days count in UTC. */
export function bounds(r: Range, now = Date.now()): [Date, Date] {
  if ("days" in r) return [new Date(now - r.days * 864e5), new Date(now)];
  return [new Date(r.from + "T00:00:00Z"), new Date(Date.parse(r.to + "T00:00:00Z") + 864e5)];
}
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The report for the last `days` full days, or for a custom range (only the latest custom range is cached). */
export function report(r: Range) {
  const ok = "days" in r ? (RANGES as readonly number[]).includes(r.days) : span(r) !== null;
  if (!ok) return Promise.reject(new Error("bad range"));
  const k = "days" in r ? String(r.days) : `${r.from}..${r.to}`;
  let p = inflight.get(k);
  if (!p) inflight.set(k, p = run(r).finally(() => inflight.delete(k)));
  return p;
}

async function run(r: Range) {
  const custom = "days" in r ? null : r, days = "days" in r ? r.days : span(r)!, k = custom ? `${custom.from}..${custom.to}` : "";
  const key = custom ? "ga:cache2:custom" : `ga:cache2:${days}`; // v2: the report grew; old v1 copies lack the new sections
  const hit = await read(key);
  return cached(hit && (hit.k ?? "") === k ? hit : undefined, async () => {
    const c = await load();
    if (!c.enabled) throw new Error("Google Analytics is turned off.");
    const from = custom && Date.parse(custom.from + "T00:00:00Z"), cur = custom ? { startDate: custom.from, endDate: custom.to } : { startDate: `${days}daysAgo`, endDate: "yesterday" };
    const before = custom ? { startDate: iso(from! - days * 864e5), endDate: iso(from! - 864e5) } : { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` };
    const top = (dimension: string, metric: string) => ({ dateRanges: [cur], dimensions: [{ name: dimension }], metrics: [{ name: metric }], orderBys: [{ metric: { metricName: metric }, desc: true }], limit: 10 });
    const out = await api(c, "batchRunReports", { requests: [
      { dateRanges: [cur], dimensions: [{ name: "date" }], metrics: ["activeUsers", "screenPageViews", "sessions"].map((name) => ({ name })), orderBys: [{ dimension: { dimensionName: "date" } }] },
      { dateRanges: [cur, before], metrics: ["activeUsers", "screenPageViews", "engagementRate", "averageSessionDuration", "sessions", "newUsers"].map((name) => ({ name })) },
      top("pagePath", "screenPageViews"), { ...top("sessionSource", "sessions"), limit: 50 }, top("country", "activeUsers"),
    ] });
    // GA4 allows 5 reports per call, so the extra sections go in two more calls, all at once. A failure here fails the refresh (the old copy is shown instead).
    const [b, g] = await Promise.all([
      api(c, "batchRunReports", { requests: [top("deviceCategory", "activeUsers"), top("browser", "activeUsers"), top("operatingSystem", "activeUsers"), top("landingPage", "sessions"), top("city", "activeUsers")] }),
      api(c, "batchRunReports", { requests: [top("sessionDefaultChannelGroup", "sessions"), top("newVsReturning", "activeUsers"), top("eventName", "eventCount"), { ...top("dateHour", "sessions"), limit: 9000, orderBys: [] }, { dateRanges: [cur], dimensions: [{ name: "date" }, { name: "sessionSource" }], metrics: [{ name: "sessions" }], limit: 100000 }] }),
    ]);
    const fresh = { k, at: Date.now(), report: shape(days, out.reports ?? [], [...(b.reports ?? []), ...(g.reports ?? [])]) };
    await write(key, fresh);
    return fresh;
  });
}

let liveMemo: { at: number; v: { now: number; pages: { page: string; n: number }[] } } | undefined;
/** Visitors on the site in the last 30 minutes and what they are looking at. Not part of the hourly cache; remembered 30 seconds so many admins cost one call. */
export async function realtime() {
  if (liveMemo && Date.now() - liveMemo.at < 30_000) return liveMemo.v;
  const c = await load();
  if (!c.enabled) throw new Error("Google Analytics is turned off.");
  const [total, pages] = await Promise.all([api(c, "runRealtimeReport", { metrics: [{ name: "activeUsers" }] }), api(c, "runRealtimeReport", { dimensions: [{ name: "unifiedScreenName" }], metrics: [{ name: "activeUsers" }], limit: 5 })]);
  const v = { now: Number(rows(total)[0]?.[0] ?? 0), pages: rows(pages).map(([page, n]) => ({ page: String(page), n: Number(n) })) }; // page here is the page title, which is what GA calls the screen name
  liveMemo = { at: Date.now(), v };
  return v;
}
