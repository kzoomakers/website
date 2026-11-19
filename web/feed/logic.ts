// Pure write-path logic ported from Lobsters: hotness (story.rb), comment confidence (comment.rb), URL cleaning and normalizing (utils.rb, story.rb url=). No imports so tests load it directly.

export const HOTNESS_WINDOW = 60 * 60 * 22;

/** Ruby's String#split: trailing empty strings are dropped. */
const rsplit = (s: string, re: RegExp | string) => { const a = s.split(re); while (a.length && a[a.length - 1] === "") a.pop(); return a; };

/** story.rb calculated_hotness. `base` = sum of tag hotness_mod (+0.25 for an author-submitted URL story); `commentPoints` = sum of (score+1) of merged comments by others, times 0.5 (0 when base < 0); `mergedScore` = scores of stories merged into this one. */
export function hotness(o: { score: number; base: number; commentPoints?: number; mergedScore?: number; createdAt: Date }) {
  const c = Math.min(o.score, (o.base < 0 ? 0 : o.commentPoints ?? 0) + (o.mergedScore ?? 0));
  const order = Math.log10(Math.max(Math.abs(o.score + 1) + c, 1));
  const sign = Math.sign(o.score);
  return -Math.round((order * sign + o.base + o.createdAt.getTime() / 1000 / HOTNESS_WINDOW) * 1e7) / 1e7 || 0;
}

/** comment.rb calculated_confidence: Wilson lower bound at 80%. score includes flags (ups = score + flags). */
export function confidence(score: number, flags: number, gone = false) {
  const ups = score + flags, n = ups + flags;
  if (gone || n === 0) return 0;
  if (n < 0) throw new Error("n should count number of upvotes + flags; that can't be a negative number");
  const z = 1.281551565545, p = ups / n;
  const c = (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return Math.min(1, Math.max(0, c));
}

/** comment.rb confidence_order: 3 bytes, inverted big-endian confidence then the low byte of the id. Sorts ascending as bytea. */
export function confidenceOrder(conf: number, id: number) {
  const v = 65535 - Math.floor(conf * 65535);
  return Buffer.from([v >> 8, v & 255, id & 255]);
}

/** Utils::URL_RE: needs a dot in the host so internal hostnames can't be submitted. */
export const URL_RE = /^(?<protocol>https?):\/\/(?<domain>(?:[^./]+\.)+[a-z-]+)(?<port>:\d+)?(?:\/[\w.~:/?#[\]@!$&'()*+,;=%-]*)?$/i;

/** Utils.normalize: the key duplicate detection compares. Byte-for-byte the Ruby rules. */
export function normalizeUrl(input: string) {
  if (!input?.trim()) return input;
  let url = input;
  url = url.replace(/#.*$/m, "").replace(/\/$/, "").replace(/\.html?$/, "");
  url = url.replace(/\/index$/, "").replace(/\/index\.php/, "").replace(/\/Default\.aspx$/, "");
  url = url.replace(/https?:\/\//, "");
  url = url.replace(/^www\d*\.(.+?\..+)/, "$1");
  const [first = "", ...args] = rsplit(url, /[&?]/);
  url = first;
  if (args.length) {
    const kv = args.map((a) => rsplit(a, "="));
    kv.sort((a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return a.length - b.length; });
    url += "?" + kv.map((a) => a.join("=")).join("&");
  }
  url = url.replace(/^arxiv\.org\/(?:abs|html|pdf)\/(\d{4}\.\d{4,5}(?:v\d)?)(?:\.pdf)?/, "arxiv.org/abs/$1");
  url = url.replace(/rfc-editor\.org\/(?:rfc|info)\/rfc(\d+)[^/]*$/, "rfc-editor.org/rfc/$1");
  url = url.replace(/^m\.youtube\.com\//, "youtube.com/").replace(/^youtu\.be\//, "youtube.com/watch?v=");
  url = url.replace(/^youtube\.com\/.*v=([A-Za-z0-9\-_]+).*/, "youtube.com/watch?v=$1");
  return url.replace(/^youtube\.com\/playlist\?.*list=([A-Za-z0-9\-_]+).*/, "youtube.com/playlist?list=$1");
}

/** story.rb url=: trim, drop tracking params and the default port. `lobstersRef` is true when a lobsters/src=lobsters/ref=lobsters param was removed (Lobsters tattles to mods; we report it). */
export function cleanUrl(input: string) {
  let u = input.trim(), lobstersRef = false;
  const m = u.match(/^([^?]+)\?(.+)$/s);
  if (m) {
    const params = m[2].split(/[&?]/).filter((p) => { if (/^lobsters|^src=lobsters|^ref=lobsters/.test(p)) { lobstersRef = true; return false; } return true; })
      .filter((p) => !/^utm_(source|medium|campaign|term|content|referrer)=|^sk=|^gclid=|^fbclid=|^linkId=|^pp=|^si=|^trk=|^ref=/.test(p));
    u = m[1] + (params.length ? "?" + params.join("&") : "");
  }
  const r = u.match(URL_RE);
  if (r?.groups && ((r.groups.protocol.toLowerCase() === "http" && r.groups.port === ":80") || (r.groups.protocol.toLowerCase() === "https" && r.groups.port === ":443")))
    u = u.replace(new RegExp(`^(${r.groups.protocol}://${r.groups.domain.replace(/[.]/g, "\\.")})${r.groups.port}`, "i"), "$1");
  return { url: u, normalized: normalizeUrl(u), domain: r?.groups?.domain ?? null, lobstersRef };
}
