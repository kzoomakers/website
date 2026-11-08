// Internal addresses (health checks and the like) that are never worth a row in the HTTP log. Matches with or without the IPv4-mapped "::ffff:" prefix.
const SKIP_IPS = new Set(["172.19.19.81", "172.19.31.1"]);
export const skipped = (ip: string) => SKIP_IPS.has(ip.replace(/^::ffff:/i, ""));

/** Static files are not logged (the same set the old middleware matcher left out). */
export const staticPath = (p: string) => p.startsWith("/_next/static") || p.startsWith("/_next/image") || p === "/favicon.ico";

/** Status to store: what we sent, or 499 when the visitor hung up before we finished (like nginx). */
export const statusOf = (code: number, finished: boolean) => (finished ? code : 499);

/** A Node request seen as the small part of the web Request that toRow reads, so one log row builder serves both. */
export function webLike(req: { url?: string; method?: string; headers: Record<string, string | string[] | undefined> }) {
  const get = (k: string) => { const v = req.headers[k.toLowerCase()]; return Array.isArray(v) ? v.join(", ") : v ?? null; };
  const proto = get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return { url: `${proto}://${get("host") ?? "localhost"}${req.url ?? "/"}`, method: req.method ?? "GET", headers: { get } };
}
