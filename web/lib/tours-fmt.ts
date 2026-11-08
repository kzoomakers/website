// Pure date formatting for tour emails (no database), so it can be unit-tested.
export type Offer = { date: string; start: string; end: string };
export const TZ = "America/Detroit"; // shortcut: fixed timezone, make it a setting if the space ever moves
export const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** One stable colour (hue 0-359) per person, so a guide looks the same in the calendar and the timeline. */
export const hue = (k: string) => { let h = 7; for (const c of k.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h * 47) % 360; };
export const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
const t12 = (t: string) => new Date(`2000-01-01T${t}:00Z`).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
/** "11/12/26, a Thursday, at 3:15 PM – 4:15 PM (EST)": the zone abbreviation follows daylight saving for that date. */
export const fmtOffer = (o: Offer) => {
  const wd = new Date(`${o.date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
  const zone = new Date(`${o.date}T12:00:00Z`).toLocaleTimeString("en-US", { timeZone: TZ, timeZoneName: "short" }).split(" ").pop();
  return `${o.date.slice(5, 7)}/${o.date.slice(8)}/${o.date.slice(2, 4)}, a ${wd}, at ${t12(o.start)} – ${t12(o.end)} (${zone})`;
};

/** Volunteer-proposed times: 1 to 5, each well-formed, at least 5 minutes long and not before `now` ("YYYY-MM-DD HH:mm" in the space's time). Returns them sorted. */
export function checkOffers(raw: unknown, now: string): Offer[] {
  const offers = (Array.isArray(raw) ? raw : []).map((o: any) => ({ date: String(o?.date ?? ""), start: String(o?.start ?? ""), end: String(o?.end ?? "") }));
  if (!offers.length || offers.length > 5) throw new Error("Add between 1 and 5 times.");
  for (const o of offers) {
    if (!DATE.test(o.date) || !TIME.test(o.start) || !TIME.test(o.end)) throw new Error("Every time needs a date, a start and an end.");
    if (mins(o.end) - mins(o.start) < 5) throw new Error(`${fmtOffer(o)} ends before it starts.`);
    if (`${o.date} ${o.start}` < now) throw new Error(`${fmtOffer(o)} is too soon or already past.`);
  }
  return offers.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}

/** Reminder moments, minutes before the start. A reminder is only due within 30 minutes after its moment, so a late booking or a restart never logs an hours-old "in 6 hours". */
export const REMINDERS = [[360, "reminder_6h", "in 6 hours"], [180, "reminder_3h", "in 3 hours"], [60, "reminder_1h", "in 1 hour"], [0, "reminder_now", "due now"]] as const;
export const reminderDue = (minutesLeft: number) => REMINDERS.find(([m]) => minutesLeft <= m && minutesLeft > m - 30);

const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export function cleanEmail(x: unknown) {
  const m = String(x ?? "").trim().toLowerCase();
  if (!EMAIL_OK.test(m) || m.length > 200) throw new Error("That email address isn't valid.");
  return m;
}
export function cleanDays(x: unknown) {
  const n = Number(x);
  if (!Number.isInteger(n) || n < 0 || n > 90) throw new Error("Days must be a whole number from 0 (off) to 90.");
  return n;
}
