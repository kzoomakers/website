import { db } from "./db";

// Which AI and search crawlers read the site? Google Analytics only counts people (bots don't run its script), so this counts them from the server's own HTTP log
// (Admin > Services > HTTP log) by the name each bot gives in its user agent. A bot can lie about its name; this is a good estimate, not proof.
export type BotKind = "training" | "assistant" | "search";
export const BOT_KINDS: Record<BotKind, string> = { training: "AI training / indexing", assistant: "AI assistant fetching for a person", search: "Search engine" };
const BOTS: [RegExp, string, BotKind][] = [
  [/OAI-SearchBot/i, "OAI-SearchBot (ChatGPT search)", "assistant"], [/ChatGPT-User/i, "ChatGPT-User", "assistant"], [/GPTBot/i, "GPTBot (OpenAI)", "training"],
  [/Claude-User|Claude-SearchBot/i, "Claude (fetching for a person)", "assistant"], [/ClaudeBot|anthropic-ai/i, "ClaudeBot (Anthropic)", "training"],
  [/Perplexity-User/i, "Perplexity-User", "assistant"], [/PerplexityBot/i, "PerplexityBot", "assistant"],
  [/CCBot/i, "CCBot (Common Crawl)", "training"], [/Bytespider/i, "Bytespider (ByteDance)", "training"], [/Amazonbot/i, "Amazonbot", "training"],
  [/meta-externalagent|FacebookBot/i, "Meta AI crawler", "training"], [/Applebot/i, "Applebot", "search"], [/Googlebot/i, "Googlebot", "search"], [/bingbot/i, "Bingbot", "search"], [/DuckDuckBot/i, "DuckDuckBot", "search"],
];
const ANY = BOTS.map(([r]) => r.source).join("|");

/** Names the bot behind a user agent, or null for anything else (people, other bots). Pure. */
export const botOf = (ua: string) => { const b = BOTS.find(([r]) => r.test(ua)); return b ? { bot: b[1], kind: b[2] } : null; };

/** Adds up requests per user agent into one row per bot, most active first. Pure. */
export function tally(rows: { ua: string; n: number }[]) {
  const t = new Map<string, { bot: string; kind: BotKind; n: number }>();
  for (const { ua, n } of rows) { const b = botOf(ua); if (b) t.set(b.bot, { ...b, n: (t.get(b.bot)?.n ?? 0) + n }); }
  return [...t.values()].sort((a, b) => b.n - a.n);
}

const memo = new Map<string, { at: number; v: ReturnType<typeof tally> }>(); // 10 minutes: the log can be millions of rows
/** Requests per bot between two moments. Empty when the HTTP log has nothing (or does not exist yet). */
export async function crawlers(from: Date, to: Date) {
  const hour = (d: Date) => Math.floor(+d / 36e5), key = `${hour(from)}|${hour(to)}`, hit = memo.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  const d = db();
  if (!d) return [];
  await d.ready;
  const rows = await d.pool.query("SELECT ua, count(*)::int AS n FROM http_log WHERE at >= $1 AND at < $2 AND ua ~* $3 GROUP BY ua", [from, to, ANY]).then((r) => r.rows, () => []);
  const v = tally(rows);
  memo.set(key, { at: Date.now(), v });
  if (memo.size > 50) memo.delete(memo.keys().next().value!);
  return v;
}
