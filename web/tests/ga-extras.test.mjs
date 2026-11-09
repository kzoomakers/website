import { test } from "node:test";
import assert from "node:assert/strict";
const { detect, digestLines, withYesterday, clockIn, digestDue } = await import("../lib/ga-digest.ts");
const { botOf, tally } = await import("../lib/ga-bots.ts");
const { sourceOf, group } = await import("../lib/ga-attr.ts");
const { byLocalTime, bounds } = await import("../lib/ga.ts");
const { lastDay } = await import("../lib/gsc.ts");

const days = (...u) => u.map((users, i) => ({ d: `2026-11-${String(i + 1).padStart(2, "0")}`, users }));
const base = Array(14).fill(20);

test("alerts: a day at 2x the usual is a spike, at 40% or less a drop, anything else is quiet", () => {
  assert.equal(detect(days(...base, 40)).kind, "spike");
  assert.equal(detect(days(...base, 8)).kind, "drop");
  assert.equal(detect(days(...base, 25)), null);
});
test("alerts: quiet sites and short histories never alarm", () => {
  assert.equal(detect(days(...Array(14).fill(5), 20)), null); // usual 5 visitors: too small to mean anything
  assert.equal(detect(days(20, 20, 20, 90)), null); // under a week of history
  assert.equal(detect([]), null);
});

test("weekly email: plain sentences with changes, AI visits and searches, and nothing invented when data is missing", () => {
  const r = { users: 120, views: 300, sessions: 150, prev: { users: 100, views: 300 }, kinds: { ai: 7 }, pages: [{ page: "/tours", views: 50 }], sources: [{ source: "google", sessions: 40 }], countries: [{ country: "United States", users: 90 }], hourly: Array(24).fill(0).map((_, h) => (h === 13 ? 9 : 0)) };
  const t = digestLines(r, ["makerspace kalamazoo"]).join("\n");
  assert.match(t, /Visitors: 120 \(\+20% vs\. the week before\)/);
  assert.match(t, /AI assistants sent 7 visits/);
  assert.match(t, /Busiest hour: 13:00 to 14:00/);
  assert.match(t, /makerspace kalamazoo/);
  assert.doesNotMatch(digestLines({ ...r, kinds: {}, hourly: Array(24).fill(0) }).join("\n"), /AI assistants|Busiest/);
});

test("crawlers: bots are named by user agent, counted per bot, and people are ignored", () => {
  assert.deepEqual(botOf("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)"), { bot: "GPTBot (OpenAI)", kind: "training" });
  assert.equal(botOf("Mozilla/5.0 ChatGPT-User/1.0").kind, "assistant"); // not mistaken for GPTBot
  assert.equal(botOf("Mozilla/5.0 (Macintosh) Safari/605.1.15"), null);
  const t = tally([{ ua: "ClaudeBot/1.0", n: 3 }, { ua: "claudebot/2", n: 4 }, { ua: "Googlebot/2.1", n: 10 }, { ua: "Chrome", n: 99 }]);
  assert.deepEqual(t.map((x) => [x.bot, x.n]), [["Googlebot", 10], ["ClaudeBot (Anthropic)", 7]]);
});

test("conversions: the source comes only from a clean ft cookie, and totals group per kind", () => {
  assert.equal(sourceOf("a=1; ft=chatgpt.com; b=2"), "chatgpt.com");
  for (const bad of [null, "", "ft=", "ft=<script>", "ft=" + "a".repeat(61), "xft=google"]) assert.equal(sourceOf(bad), "", String(bad));
  const g = group([{ kind: "tour", source: "google", n: 3 }, { kind: "tour", source: "chatgpt.com", n: 5 }, { kind: "tour", source: "", n: 2 }, { kind: "contact", source: "direct", n: 1 }]);
  const tour = g.find((x) => x.kind === "tour");
  assert.deepEqual([tour.total, tour.unknown, tour.sources[0].source, tour.sources[0].type], [10, 2, "chatgpt.com", "ai"]);
  assert.equal(g.find((x) => x.kind === "subscribe").total, 0);
  assert.equal(g.find((x) => x.kind === "contact").sources[0].type, "direct"); // "direct" is its own type, not "other sites"
});

test("heatmap: Google's property clock is converted to Eastern before filling weekday x hour", () => {
  const out = byLocalTime([["2026110121", 8], ["2026110110", 5]], "America/Los_Angeles"); // Sun 21:00 PST = Mon 00:00 Eastern; Sun 10:00 PST = Sun 13:00 Eastern
  assert.equal(out.heat[1][0], 8);
  assert.equal(out.heat[0][13], 5);
  assert.equal(out.heat.flat().reduce((a, b) => a + b), 13);
});

test("custom ranges: bounds cover whole days, and Search Console stops two days back", () => {
  const [a, b] = bounds({ from: "2026-11-01", to: "2026-11-02" });
  assert.deepEqual([a.toISOString(), b.toISOString()], ["2026-11-01T00:00:00.000Z", "2026-11-03T00:00:00.000Z"]);
  assert.equal(lastDay(Date.parse("2026-11-09T12:00:00Z")), "2026-11-07");
});

test("alerts: after an outage Google has no row for the empty days, and they count as zero visitors", () => {
  const seen = days(...base); // last real day is Nov 14
  const padded = withYesterday(seen, "2026-11-16");
  assert.deepEqual(padded.slice(-2), [{ d: "2026-11-15", users: 0 }, { d: "2026-11-16", users: 0 }]);
  assert.equal(detect(padded).kind, "drop"); // the broken-tag case that used to stay silent
  assert.equal(detect(seen), null);
  assert.equal(withYesterday(seen, "2026-11-14"), seen); // nothing missing: unchanged
  assert.deepEqual(withYesterday([], "2026-11-16"), []); // no history at all: nothing to compare
});

test("alerts: yesterday and the hour are read on the property's clock, not UTC", () => {
  const t = Date.parse("2026-11-10T03:00:00Z"); // still Nov 9 evening in Eastern and Pacific
  assert.deepEqual(clockIn("America/Detroit", t), { yesterday: "2026-11-08", hour: 22 });
  assert.deepEqual(clockIn("UTC", t), { yesterday: "2026-11-09", hour: 3 });
});

test("weekly email: due only on Monday from 8am Eastern, and only once that day", () => {
  assert.equal(digestDue("", new Date("2026-11-09T13:00:00Z")), "2026-11-09"); // Mon 08:00 EST
  assert.equal(digestDue("", new Date("2026-11-09T12:59:00Z")), null); // 07:59
  assert.equal(digestDue("", new Date("2026-11-08T18:00:00Z")), null); // Sunday
  assert.equal(digestDue("2026-11-09", new Date("2026-11-09T20:00:00Z")), null); // already sent today
  assert.equal(digestDue("2026-11-02", new Date("2026-11-09T20:00:00Z")), "2026-11-09"); // last week's does not block
  assert.equal(digestDue("", new Date("2026-07-06T12:00:00Z")), "2026-07-06"); // summer: 08:00 EDT
  assert.equal(digestDue("", new Date("2026-07-06T11:59:00Z")), null);
});
