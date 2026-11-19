// SSRF-safe URL metadata fetch, replacing Lobsters' extras/sponge.rb + Story#fetched_attributes. DNS is resolved once, every address is checked, and the connection is made to
// that exact address (no second lookup to rebind). Redirects are re-checked hop by hop. Only http/https on ports 80/443, IPv4 only (as sponge.rb), size and time capped.
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { load } from "cheerio";

// sponge.rb BAD_NETS (rfc6890 + multicast + reserved)
const BAD_NETS = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "255.255.255.255/32"]
  .map((c) => { const [a, b] = c.split("/"); const bits = +b; return { net: ip4(a), mask: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }; });
function ip4(s: string) { return s.split(".").reduce((n, o) => ((n << 8) | +o) >>> 0, 0); }

export const isBadIp = (ip: string) => { const n = ip4(ip); return BAD_NETS.some((b) => ((n & b.mask) >>> 0) === b.net); };

export const MAX_BYTES = 5 * 1024 * 1024; // story.rb refuses to parse bodies of 5 MB or more
const UA = "Mozilla/5.0 (compatible; kzoomakers-talk)";

export class FetchError extends Error {}

/** Resolve `host` to one public IPv4 address or throw. */
export async function resolvePublic(host: string, lookup: (h: string) => Promise<string[]> = async (h) => (await dns.resolve4(h))): Promise<string> {
  if (net.isIP(host)) { if (net.isIP(host) !== 4 || isBadIp(host)) throw new FetchError(`refusing to talk to ${host}`); return host; }
  let ips: string[];
  try { ips = await Promise.race([lookup(host), new Promise<string[]>((_, r) => setTimeout(() => r(new Error("dns timeout")), 5000))]); } catch (e) { throw new FetchError(`couldn't resolve ${host}: ${(e as Error).message}`); }
  if (!ips.length) throw new FetchError(`no addresses for ${host}`);
  if (ips.some(isBadIp)) throw new FetchError(`refusing to talk to a private address for ${host}`); // any bad record fails the host: no picking around it
  return ips[Math.floor(Math.random() * ips.length)];
}

type Res = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

export function once(u: URL, ip: string, timeoutMs: number): Promise<Res> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    // lookup is pinned to the vetted address; servername/Host keep TLS and virtual hosting correct. Certificates are not verified: the fetch only reads a page title
    // (as sponge usage in story.rb), and nothing from it is trusted beyond text that is escaped on output.
    const req = lib.request({ host: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method: "GET", timeout: timeoutMs, rejectUnauthorized: false, servername: u.hostname,
      lookup: ((_h: string, o: { all?: boolean }, cb: (e: null, a: unknown, f?: number) => void) => (o?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4))) as never, // Node 20+ asks for all addresses (autoSelectFamily)
      headers: { "User-Agent": UA, "Accept-Encoding": "identity", Accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5" } }, (res) => {
      const chunks: Buffer[] = []; let n = 0;
      res.on("data", (c: Buffer) => { n += c.length; if (n > MAX_BYTES) { req.destroy(new FetchError("response too large")); return; } chunks.push(c); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new FetchError("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** GET with manual, re-vetted redirects. Returns null on any failure (callers treat the metadata as best-effort, like Sponge#try_fetch). */
export async function safeGet(url: string, o: { timeoutMs?: number; redirects?: number; lookup?: (h: string) => Promise<string[]> } = {}): Promise<(Res & { url: string }) | null> {
  let cur = url;
  for (let left = o.redirects ?? 3; left >= 0; left--) {
    try {
      const u = new URL(cur);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("scheme");
      if (u.username || u.password) throw new FetchError("credentials in url");
      if (u.port && u.port !== (u.protocol === "https:" ? "443" : "80")) throw new FetchError("port"); // security: do not connect to arbitrary user-submitted ports
      const ip = await resolvePublic(u.hostname, o.lookup);
      const r = await once(u, ip, o.timeoutMs ?? 3000);
      if (r.status >= 300 && r.status < 400 && r.headers.location) { cur = new URL(r.headers.location, u).href; continue; }
      return r.status >= 200 && r.status < 300 ? { ...r, url: cur } : null;
    } catch { return null; }
  }
  return null; // too many redirects
}

const squish = (s: string) => s.replace(/\s+/g, " ").trim();

/** story.rb fetched_attributes_html: best title (og:title, meta title, <title>), site name and "GitHub - owner/" stripped, plus the canonical URL. */
export function parseHtmlAttributes(html: string, pageUrl: string) {
  const $ = load(html);
  let title = squish($("meta[property='og:title']").attr("content") ?? "") || squish($("meta[name='title']").attr("content") ?? "") || squish($("title").first().text());
  const site = $("meta[property='og:site_name']").attr("content") ?? "";
  if (site && site.length < title.length && title.endsWith(site)) { title = title.slice(0, -site.length); if (/ [ \-|–] $/.test(title.slice(-3))) title = title.slice(0, -3); }
  title = title.replace(/GitHub - [a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}\//i, "");
  let canonical: string | undefined;
  try {
    const c = new URL($("link[rel='canonical']").attr("href") ?? "", pageUrl);
    if ((c.protocol === "http:" || c.protocol === "https:") && c.pathname !== "/" && c.href !== pageUrl) canonical = c.href; // not the domain root, and different from what was submitted
  } catch { /* none */ }
  return { title, canonical };
}

/** Title (and canonical URL) for the submit form. Never throws. The canonical URL is only offered, not fetched, so it can't be used to reach anything. */
export async function fetchUrlAttributes(url: string) {
  const r = await safeGet(url);
  if (!r) return { url, title: "" };
  const type = String(r.headers["content-type"] ?? "");
  if (/pdf/i.test(type)) return { url, title: "" }; // shortcut: PDF titles (pdf-reader in Ruby) not read, add a PDF parser if people miss it
  if (!/html|xml/i.test(type) && type) return { url, title: "" };
  const { title, canonical } = parseHtmlAttributes(r.body.toString("utf8"), r.url);
  return canonical ? { url: canonical, title } : { url, title };
}
