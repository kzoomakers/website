// Works out where a visitor came from: an AI assistant, a search engine, a social site, or somewhere else. Pure functions, no database.
export type Kind = "ai" | "search" | "social" | "other";
export type Hit = { kind: Kind; source: string; host: string; via: "referrer" | "utm" };

// hosts match exactly or as a subdomain; a RegExp is tried against the whole hostname (for country domains like google.co.uk). utm = names seen in utm_source.
type Src = { name: string; kind: Kind; hosts: (string | RegExp)[]; utm?: string[] };
const SOURCES: Src[] = [
  { name: "ChatGPT", kind: "ai", hosts: ["chatgpt.com", "chat.openai.com"], utm: ["chatgpt.com", "chatgpt", "openai"] },
  { name: "Perplexity", kind: "ai", hosts: ["perplexity.ai"], utm: ["perplexity", "perplexity.ai"] },
  { name: "Claude", kind: "ai", hosts: ["claude.ai"], utm: ["claude", "claude.ai"] },
  { name: "Gemini", kind: "ai", hosts: ["gemini.google.com", "bard.google.com"], utm: ["gemini", "gemini.google.com"] },
  { name: "Copilot", kind: "ai", hosts: ["copilot.microsoft.com"], utm: ["copilot", "copilot.microsoft.com"] },
  { name: "Meta AI", kind: "ai", hosts: ["meta.ai"], utm: ["meta", "meta.ai"] },
  { name: "Grok", kind: "ai", hosts: ["grok.com", "grok.x.ai"], utm: ["grok", "grok.com"] },
  { name: "DeepSeek", kind: "ai", hosts: ["deepseek.com"], utm: ["deepseek"] },
  { name: "You.com", kind: "ai", hosts: ["you.com"], utm: ["you.com", "you"] },
  { name: "Phind", kind: "ai", hosts: ["phind.com"], utm: ["phind"] },
  { name: "Mistral Le Chat", kind: "ai", hosts: ["chat.mistral.ai"], utm: ["mistral", "chat.mistral.ai"] },
  { name: "Poe", kind: "ai", hosts: ["poe.com"], utm: ["poe"] },
  { name: "Google", kind: "search", hosts: [/(^|\.)google\.[a-z.]{2,6}$/], utm: ["google"] },
  { name: "Bing", kind: "search", hosts: ["bing.com"], utm: ["bing"] },
  { name: "DuckDuckGo", kind: "search", hosts: ["duckduckgo.com"], utm: ["duckduckgo"] },
  { name: "Yahoo", kind: "search", hosts: [/(^|\.)yahoo\.[a-z.]{2,6}$/], utm: ["yahoo"] },
  { name: "Brave Search", kind: "search", hosts: ["search.brave.com"], utm: ["brave", "brave.com"] },
  { name: "Kagi", kind: "search", hosts: ["kagi.com"], utm: ["kagi"] },
  { name: "Ecosia", kind: "search", hosts: ["ecosia.org"], utm: ["ecosia"] },
  { name: "Startpage", kind: "search", hosts: ["startpage.com"] },
  { name: "Qwant", kind: "search", hosts: ["qwant.com"] },
  { name: "Baidu", kind: "search", hosts: ["baidu.com"] },
  { name: "Yandex", kind: "search", hosts: [/(^|\.)yandex\.[a-z.]{2,6}$/] },
  { name: "Facebook", kind: "social", hosts: ["facebook.com", "fb.com", "fb.me"], utm: ["facebook", "fb"] },
  { name: "Instagram", kind: "social", hosts: ["instagram.com"], utm: ["instagram", "ig"] },
  { name: "X / Twitter", kind: "social", hosts: ["t.co", "twitter.com", "x.com"], utm: ["twitter", "x"] },
  { name: "LinkedIn", kind: "social", hosts: ["linkedin.com", "lnkd.in"], utm: ["linkedin"] },
  { name: "Reddit", kind: "social", hosts: ["reddit.com", "redd.it"], utm: ["reddit"] },
  { name: "YouTube", kind: "social", hosts: ["youtube.com", "youtu.be"], utm: ["youtube"] },
  { name: "TikTok", kind: "social", hosts: ["tiktok.com"], utm: ["tiktok"] },
  { name: "Pinterest", kind: "social", hosts: ["pinterest.com", "pin.it"], utm: ["pinterest"] },
  { name: "Threads", kind: "social", hosts: ["threads.net", "threads.com"], utm: ["threads"] },
  { name: "Bluesky", kind: "social", hosts: ["bsky.app"], utm: ["bluesky"] },
  { name: "Nextdoor", kind: "social", hosts: ["nextdoor.com"], utm: ["nextdoor"] },
  { name: "Meetup", kind: "social", hosts: ["meetup.com"], utm: ["meetup"] },
];

const hostMatch = (h: string, p: string | RegExp) => (typeof p === "string" ? h === p || h.endsWith("." + p) : p.test(h));
const bare = (h: string) => h.replace(/^www\./, "");

/** Where a page view came from, or null when it should not be counted (no outside source, or the visitor was just moving around this site). `ownHost` is the host being visited. */
export function classify(referer: string, utmSource: string, ownHost: string): Hit | null {
  let host = "";
  try { host = bare(new URL(referer).hostname.toLowerCase()); } catch { /* no usable referrer */ }
  const own = bare(ownHost.toLowerCase().replace(/:\d+$/, ""));
  if (host && host === own) return null;
  const byHost = host ? SOURCES.find((s) => s.hosts.some((p) => hostMatch(host, p))) : undefined;
  // An AI assistant's own tag or host beats a plain search/other referrer: ChatGPT tags its links and often hides the referrer.
  const utm = utmSource.trim().toLowerCase().slice(0, 100);
  const byUtm = utm ? SOURCES.find((s) => s.utm?.includes(utm)) : undefined;
  if (byHost?.kind === "ai") return { kind: "ai", source: byHost.name, host, via: "referrer" };
  if (byUtm?.kind === "ai") return { kind: "ai", source: byUtm.name, host, via: "utm" };
  if (byHost) return { kind: byHost.kind, source: byHost.name, host, via: "referrer" };
  if (byUtm) return { kind: byUtm.kind, source: byUtm.name, host, via: "utm" };
  if (host) return { kind: "other", source: host, host, via: "referrer" };
  return utm ? { kind: "other", source: utm, host: "", via: "utm" } : null;
}

const ROBOT = /bot|crawl|spider|slurp|preview|headless|facebookexternalhit|whatsapp|embedly|curl|wget|python|go-http|node-fetch|monitor|uptime/i;
/** Only real page views from people count: a successful GET of a page (not the API, admin or Next internals) by something that isn't a robot. */
export const countable = (r: { method: string; status?: number; path: string; ua: string }) =>
  r.method === "GET" && (r.status ?? 0) >= 200 && (r.status ?? 0) < 300 && !/^\/(api|admin|_next)(\/|$)/.test(r.path) && !/\.[a-z0-9]{2,5}$/i.test(r.path) && !ROBOT.test(r.ua);
