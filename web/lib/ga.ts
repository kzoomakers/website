import { createSign } from "crypto";
import { db } from "./db";
import { openText, sealText } from "./vault";
import { classify } from "./referrers-util";

// Optional Google Analytics: a tracking tag for the public site plus a report page for staff (Admin > Website > Analytics).
// Settings live in the settings table (key "ga:config", service-account key sealed). Reports come from the GA4 Data API over plain fetch and are cached 60 minutes in the same table.
export const CACHE_MS = 60 * 60_000;
export const RANGES = [7, 30, 90] as const;
type Cfg = { enabled: boolean; banner: boolean; measurementId: string; propertyId: string; credentials: string }; // banner: ask visitors to accept cookies (off = nobody is asked and analytics start for everyone)
type Key = { client_email: string; private_key: string };

async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}
const read = async (key: string) => (await (await pool()).query("SELECT data FROM settings WHERE key = $1", [key])).rows[0]?.data;
const write = async (key: string, data: unknown) => void (await (await pool()).query("INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [key, JSON.stringify(data)]));
const load = async (): Promise<Cfg> => ({ enabled: false, banner: true, measurementId: "", propertyId: "", credentials: "", ...(await read("ga:config")) });

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
  return { enabled: c.enabled, banner: c.banner, measurementId: c.measurementId, propertyId: c.propertyId, serviceAccount: email };
}

/** credentials: undefined or "" keeps the saved key, "-" removes it, anything else replaces it. */
export async function save(a: { enabled: unknown; banner?: unknown; measurementId: unknown; propertyId: unknown; credentials?: unknown }) {
  const c = await load(), mid = String(a.measurementId ?? "").trim(), pid = String(a.propertyId ?? "").trim(), cred = String(a.credentials ?? "").trim();
  if (mid && !/^G-[A-Z0-9]{4,20}$/.test(mid)) throw new Error("The Measurement ID looks like G-XXXXXXXXXX.");
  if (pid && !/^\d{4,15}$/.test(pid)) throw new Error("The Property ID is a number (GA4 Admin > Property details).");
  if (cred && cred !== "-") parseKey(cred);
  if (a.enabled && !mid) throw new Error("Add the Measurement ID before turning Google Analytics on.");
  const next: Cfg = { enabled: !!a.enabled, banner: a.banner !== false, measurementId: mid, propertyId: pid, credentials: cred === "-" ? "" : cred ? sealText(cred) : c.credentials };
  await write("ga:config", next);
  await (await pool()).query("DELETE FROM settings WHERE key LIKE 'ga:cache:%'"); // new property or key: old numbers no longer apply
  tokenCache = null; tagMemo = undefined;
}

let tagMemo: { at: number; v: { id: string; banner: boolean } } | undefined; // the tag endpoint is public: remember the answer for a minute so visitors and bots don't each cost a query (per machine; save() clears it here, other machines catch up within the minute)
/** What the public pages need: the Measurement ID ("" when the feature is off) and whether to show the cookie notice. Safe to expose. */
export async function publicTag() {
  if (tagMemo && Date.now() - tagMemo.at < 60_000) return tagMemo.v;
  try { const c = await load(); tagMemo = { at: Date.now(), v: { id: c.enabled ? c.measurementId : "", banner: c.banner } }; } catch { return { id: "", banner: true }; }
  return tagMemo.v;
}

let tokenCache: { value: string; exp: number } | null = null;
const b64 = (x: object | Buffer) => Buffer.from(x instanceof Buffer ? x : JSON.stringify(x)).toString("base64url");

/** Signed service-account login (RFC 7523): trades a short-lived JWT for an access token. */
export async function accessToken(k: Key) {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.value;
  const now = Math.floor(Date.now() / 1000), head = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: k.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const jwt = head + "." + createSign("RSA-SHA256").update(head).sign(k.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }), signal: AbortSignal.timeout(15_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google refused the service-account key" + (j.error_description ? `: ${j.error_description}` : "."));
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenCache.value;
}

async function api(c: Cfg, method: "runReport" | "batchRunReports", body: object): Promise<any> {
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

type R = { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };
const rows = (r: R): any[][] => (r.rows ?? []).map((x) => [...(x.dimensionValues ?? []).map((v) => v.value), ...(x.metricValues ?? []).map((v) => Number(v.value))]);

/** Google leaves out days with no activity; put them back as zeros so the chart has one bar per day. The range ends on Google's own last day, because its days follow the property's time zone, not ours. */
function fill(days: number, got: { d: string; users: number; views: number }[]) {
  if (!got.length) return got;
  const m = new Map(got.map((x) => [x.d, x])), end = Date.parse(got.at(-1)!.d + "T00:00:00Z");
  for (let i = days - 1; i >= 0; i--) { const d = new Date(end - i * 864e5).toISOString().slice(0, 10); if (!m.has(d)) m.set(d, { d, users: 0, views: 0 }); }
  return [...m.values()].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-days);
}

/** Turns the five GA4 answers into what the page draws. Pure, so it can be tested without Google. */
export function shape(days: number, r: R[]) {
  const [daily, totals, pages, sources, countries] = r;
  const tot = (i: number) => rows(totals).find((x) => x[0] === `date_range_${i}`)?.slice(1) ?? [0, 0, 0, 0];
  const [users, views, engagement, duration] = tot(0), prev = tot(1);
  const kinds: Record<string, number> = {}, bySource = rows(sources).map(([s, n]) => {
    const name = String(s), kind = name === "(direct)" || name === "(not set)" ? "direct" : classify(`https://${name}/`, name, "")?.kind ?? "other";
    kinds[kind] = (kinds[kind] ?? 0) + Number(n);
    return { source: name, kind, sessions: Number(n) };
  });
  return {
    days, users, views, engagement, duration, prev: { users: prev[0], views: prev[1] },
    daily: fill(days, rows(daily).map(([d, u, v]) => ({ d: `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`, users: u, views: v }))),
    pages: rows(pages).map(([p, n]) => ({ page: String(p), views: Number(n) })),
    sources: bySource, kinds,
    countries: rows(countries).map(([c, n]) => ({ country: String(c), users: Number(n) })),
  };
}
export type Report = ReturnType<typeof shape>;

type Cached = { at: number; report: Report };
export type Served = Cached & { stale: boolean; error?: string };
/** Fresh copy if it is under an hour old; otherwise ask Google; if Google fails, the old copy (stale: true) rather than nothing. */
export async function cached(hit: Cached | undefined, fetchFresh: () => Promise<Cached>, now = Date.now()): Promise<Served> {
  if (hit && now - hit.at < CACHE_MS) return { ...hit, stale: false };
  try { return { ...(await fetchFresh()), stale: false }; }
  catch (e) { if (hit) return { ...hit, stale: true, error: e instanceof Error ? e.message : String(e) }; throw e; }
}

const inflight = new Map<number, ReturnType<typeof cached>>(); // many admins at once share one call to Google
/** The report for the last `days` full days. */
export function report(days: number) {
  if (!(RANGES as readonly number[]).includes(days)) return Promise.reject(new Error("bad range"));
  let p = inflight.get(days);
  if (!p) inflight.set(days, p = run(days).finally(() => inflight.delete(days)));
  return p;
}

async function run(days: number) {
  const key = `ga:cache:${days}`;
  return cached(await read(key), async () => {
    const c = await load();
    if (!c.enabled) throw new Error("Google Analytics is turned off.");
    const cur = { startDate: `${days}daysAgo`, endDate: "yesterday" }, before = { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` };
    const top = (dimension: string, metric: string) => ({ dateRanges: [cur], dimensions: [{ name: dimension }], metrics: [{ name: metric }], orderBys: [{ metric: { metricName: metric }, desc: true }], limit: 10 });
    const out = await api(c, "batchRunReports", { requests: [
      { dateRanges: [cur], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }], orderBys: [{ dimension: { dimensionName: "date" } }] },
      { dateRanges: [cur, before], metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }, { name: "engagementRate" }, { name: "averageSessionDuration" }] },
      top("pagePath", "screenPageViews"), { ...top("sessionSource", "sessions"), limit: 50 }, top("country", "activeUsers"),
    ] });
    const fresh = { at: Date.now(), report: shape(days, out.reports ?? []) };
    await write(key, fresh);
    return fresh;
  });
}
