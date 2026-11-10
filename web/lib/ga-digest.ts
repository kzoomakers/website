import type { Report } from "./ga";
import { TZ } from "./tours-fmt";

// The judging and wording parts of the alerts and the weekly email. Pure (no database), so they are tested on their own; lib/ga-notify.ts does the sending.
export const n = (x: number) => Math.round(x).toLocaleString("en-US");
export const delta = (a: number, b: number) => (b ? ` (${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs. the week before)` : "");

/** Is the last day unusual next to the 14 days before it? Needs a week of history and a normal day of at least 15 visitors, so quiet sites don't alarm over 3 people. Pure. */
export function detect(daily: { d: string; users: number }[]) {
  const last = daily.at(-1), before = daily.slice(-15, -1);
  if (!last || before.length < 7) return null;
  const avg = before.reduce((a, x) => a + x.users, 0) / before.length;
  if (avg < 15) return null;
  if (last.users >= avg * 2) return { kind: "spike" as const, day: last.d, users: last.users, avg };
  if (last.users <= avg * 0.4) return { kind: "drop" as const, day: last.d, users: last.users, avg };
  return null;
}

/** Google leaves out days with no visitors, so after an outage the list stops at an older day and looks normal. Add the missing days up to `yesterday` as zeros. Pure. */
export function withYesterday(daily: { d: string; users: number }[], yesterday: string) {
  const last = daily.at(-1);
  if (!last || last.d >= yesterday) return daily;
  const out = [...daily];
  for (let t = Date.parse(last.d + "T00:00:00Z") + 864e5; t <= Date.parse(yesterday + "T00:00:00Z"); t += 864e5) out.push({ d: new Date(t).toISOString().slice(0, 10), users: 0 });
  return out;
}

/** Yesterday's date and the current hour on the clock of a time zone (Google counts days in the property's zone, not ours). */
export function clockIn(zone: string, now = Date.now()) {
  const f = (t: number) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric" }).formatToParts(t).map((x) => [x.type, x.value]));
  const y = f(now - 864e5), c = f(now);
  return { yesterday: `${y.year}-${y.month}-${y.day}`, hour: +c.hour };
}

/** Today's date (Eastern) when the weekly email is due: a Monday, 8am or later, and not already sent today. Otherwise null. Pure. */
export function digestDue(last: string, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", weekday: "short", hour: "numeric", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`;
  return p.weekday === "Mon" && +p.hour >= 8 && last !== today ? today : null;
}

/** The week in plain sentences. `queries` are the top Search Console searches, when we have them. Pure. */
export function digestLines(r: Report, queries: string[] = []) {
  const ai = r.kinds.ai ?? 0, top = (xs: string[]) => xs.slice(0, 3).join(", ") || "none";
  const peak = r.hourly.indexOf(Math.max(...r.hourly));
  return [
    `Visitors: ${n(r.users)}${delta(r.users, r.prev.users)}. Page views: ${n(r.views)}${delta(r.views, r.prev.views)}. Sessions: ${n(r.sessions)}.`,
    `Most viewed: ${top(r.pages.map((p) => `${p.page} (${n(p.views)})`))}.`,
    `Top sources: ${top(r.sources.map((s) => `${s.source} (${n(s.sessions)})`))}.${ai ? ` AI assistants sent ${n(ai)} visits.` : ""}`,
    `Top countries: ${top(r.countries.map((c) => `${c.country} (${n(c.users)})`))}.`,
    ...(r.hourly.some(Boolean) ? [`Busiest hour: ${peak}:00 to ${peak + 1}:00 Eastern.`] : []),
    ...(queries.length ? [`People found us searching for: ${queries.slice(0, 5).join(", ")}.`] : []),
  ];
}

