import { accessToken, load, parseKey } from "./ga";
import { openText } from "./vault";

// Google Search Console: the searches that found the site. Uses the same service account as the analytics report; it also has to be added as a user
// in Search Console (Settings > Users and permissions). Everything here is optional: any problem comes back as `{ ok: false, reason }` and the page just leaves the section out.
export type Row = { key: string; clicks: number; impressions: number; ctr: number; position: number };
export type Result = { ok: true; from: string; to: string; queries: Row[]; pages: Row[] } | { ok: false; reason: string; hide: boolean };

const memo = new Map<string, { at: number; v: Result }>(); // 30 minutes per range, per machine: Search Console data moves slowly
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Search Console data is final about 2 days late, so the range is cut short at "two days ago". */
export const lastDay = (now = Date.now()) => day(now - 2 * 864e5);

export async function searchQueries(from: string, to: string, now = Date.now()): Promise<Result> {
  const m = memo.get(from + to);
  if (m && now - m.at < 30 * 60_000) return m.v;
  const v = await fetchQueries(from, to, now).catch((e): Result => ({ ok: false, reason: e instanceof Error ? e.message : String(e), hide: false }));
  memo.set(from + to, { at: now, v });
  return v;
}

async function fetchQueries(from: string, to: string, now: number): Promise<Result> {
  const c = await load();
  if (!c.enabled || !c.searchConsoleSite || !c.credentials) return { ok: false, reason: "not set up", hide: true };
  const end = to < lastDay(now) ? to : lastDay(now);
  if (from > end) return { ok: false, reason: "Search Console has no data for such recent days yet.", hide: false };
  const token = await accessToken(parseKey(openText(c.credentials)), "searchConsole");
  const ask = async (dimension: "query" | "page") => {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.searchConsoleSite)}/searchAnalytics/query`, {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ startDate: from, endDate: end, dimensions: [dimension], rowLimit: 15 }), signal: AbortSignal.timeout(20_000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 403 || r.status === 404) throw new Error(`Search Console would not share this site. Add ${parseKey(openText(c.credentials)).client_email} as a user (Restricted is enough) in Search Console > Settings > Users and permissions, check the site name, and make sure the Search Console API is enabled in Google Cloud.`);
    if (!r.ok) throw new Error(`Search Console error: ${j.error?.message ?? r.status}`);
    return ((j.rows ?? []) as any[]).map((x): Row => ({ key: String(x.keys?.[0] ?? ""), clicks: x.clicks ?? 0, impressions: x.impressions ?? 0, ctr: x.ctr ?? 0, position: x.position ?? 0 }));
  };
  const [queries, pages] = await Promise.all([ask("query"), ask("page")]);
  return { ok: true, from, to: end, queries, pages };
}
