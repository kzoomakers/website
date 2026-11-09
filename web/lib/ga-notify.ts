import { addLink, GA_TOPIC, notify, personalTopics, removeLink, subscribersOf } from "./ntfy";
import { getMailCfg, mailReady, sendQueued } from "./mail";
import { read, report, write } from "./ga";
import { searchQueries } from "./gsc";
import { cleanEmail } from "./tours-fmt";
import { clockIn, delta, detect, digestDue, digestLines, n, withYesterday } from "./ga-digest";

// Two ways the site tells staff what Google Analytics sees:
//  1. Alerts: a push to the special topic "google-analytics-notices" when yesterday was far above or below normal. People subscribe by attaching their own topic to it.
//  2. A weekly email summary (Mondays, Eastern time) to a list of addresses, with an on/off switch. Both are set up in Admin > Setup > Analytics & cookies.
export type Digest = { on: boolean; emails: string[]; last: string };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Run every few hours. Sends at most one alert per day. Silent when Google Analytics is off, failing, or only has an old copy. Waits until 6am on Google's clock so a day that is still being counted never looks like a drop. */
export async function runAlerts(now = Date.now()) {
  const s = await report({ days: 30 }).catch(() => null);
  if (!s || s.stale) return;
  const { yesterday, hour } = clockIn(s.report.zone, now);
  if (hour < 6) return;
  const daily = withYesterday(s.report.daily, yesterday), hit = detect(daily);
  if (!hit || (await read("ga:alerted")) === hit.day) return;
  await write("ga:alerted", hit.day);
  const i = s.report.daily.length - 1, top = s.report.daily[i]?.d === hit.day ? [...s.report.trend].sort((a, b) => b.vals[i] - a.vals[i])[0] : undefined; // no source breakdown for a day Google has no rows for
  await notify(GA_TOPIC, hit.kind === "spike"
    ? { title: `Traffic spike on ${hit.day}`, message: `${n(hit.users)} visitors, about ${(hit.users / hit.avg).toFixed(1)}x the usual ${n(hit.avg)}.${top?.vals[i] ? ` Biggest source: ${top.source}.` : ""}`, tags: "chart_with_upwards_trend", priority: 3 }
    : { title: `Traffic dropped on ${hit.day}`, message: `${n(hit.users)} visitors against a usual ${n(hit.avg)}. If this looks wrong, check that the tracking tag still loads.`, tags: "chart_with_downwards_trend", priority: 4 });
}

// ---- weekly email
export async function getDigest(): Promise<Digest> {
  const v = await read("ga:digest");
  return { on: !!v?.on, emails: Array.isArray(v?.emails) ? v.emails : [], last: String(v?.last ?? "") };
}
export async function saveDigest(a: { on?: unknown; emails?: unknown }) {
  const list = (Array.isArray(a.emails) ? a.emails : String(a.emails ?? "").split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean).map(cleanEmail);
  if (new Set(list).size > 20) throw new Error("Up to 20 addresses.");
  if (a.on && !list.length) throw new Error("Add at least one email address before turning the weekly email on.");
  await write("ga:digest", { ...(await getDigest()), on: !!a.on, emails: [...new Set(list)] });
}

/** Sends the summary of the last 7 days to everyone on the list. Throws if mail is not set up, so "Send now" can say so. */
export async function sendDigest(emails: string[]) {
  const mc = await getMailCfg();
  if (!mailReady(mc)) throw new Error("Email is not set up (Admin > Setup).");
  const s = await report({ days: 7 }), end = new Date(Date.now() - 864e5).toISOString().slice(0, 10), start = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const g = await searchQueries(start, end).catch(() => null), lines = digestLines(s.report, g?.ok ? g.queries.map((x) => x.key) : []);
  const subject = `Weekly site report: ${n(s.report.users)} visitors${delta(s.report.users, s.report.prev.users).replace(" vs. the week before", "")}`;
  for (const to of emails) await sendQueued({ to, subject, text: lines.join("\n\n"), html: lines.map((l) => `<p>${esc(l)}</p>`).join("") }, mc);
}

/** Hourly job: on Mondays from 8am Eastern, once. The day is marked only after the send worked, so a Google or mail failure is retried the next hour (the job lock stops two machines sending together). */
export async function runDigest(now = new Date()) {
  const d = await getDigest(), today = digestDue(d.last, now);
  if (!d.on || !d.emails.length || !today) return;
  try { await sendDigest(d.emails); } catch (e) { console.error("weekly analytics email failed, will retry:", e); return; }
  await write("ga:digest", { ...(await getDigest()), last: today });
}

// ---- who is subscribed to the alerts topic
export async function overview() {
  const [digest, people, subs] = await Promise.all([getDigest(), personalTopics(), subscribersOf(GA_TOPIC)]);
  return { digest, people, subs };
}
export async function subscribe(topic: unknown) {
  const name = String(topic);
  if (!(await personalTopics()).some((t: any) => t.name === name)) throw new Error("Pick one of the people's topics.");
  await addLink(GA_TOPIC, name);
}
export const unsubscribe = (topic: unknown) => removeLink(GA_TOPIC, String(topic));
