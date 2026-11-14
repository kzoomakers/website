import seed from "@/data/hours.json";

export type Hours = typeof seed;
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const seedHours: Hours = seed;

const TIME = /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/;
const str = (v: unknown) => typeof v === "string" && v.length < 200;
export const validHours = (h: any): h is Hours =>
  str(h?.address) && h.address.trim() !== "" &&
  [h?.openTime, h?.closeTime, h?.closedMessage, h?.closedMessageToday].every(str) && TIME.test(h.openTime) && TIME.test(h.closeTime)
  && Array.isArray(h.openDays) && h.openDays.every((d: unknown) => DAYS.includes(d as string));

/** Editor fields -> the legacy hours.json shape that dynamic/js/hours.js reads. Address/phone/titles are kept from `base`. */
export function buildHours(base: Hours, f: { openDays: string[]; openTime: string; closeTime: string; closedMessage: string; closedMessageToday: string; address: string }): Hours {
  const open = DAYS.filter((d) => f.openDays.includes(d)), closed = DAYS.filter((d) => !open.includes(d));
  const short = (l: string[]) => l.map((d) => d.slice(0, 3));
  return { ...base, contact: { ...base.contact, address: f.address }, schedule: { ...base.schedule, openDays: open, openDaysShort: short(open), closedDays: closed, closedDaysShort: short(closed),
    openTime: f.openTime, closeTime: f.closeTime, closedMessage: f.closedMessage, closedMessageToday: f.closedMessageToday,
    closeTimeDisplay: f.closeTime === "12:00 AM" ? "12:00 AM (Midnight)" : f.closeTime } };
}

/** Replaces {address}, {street} (before the first comma) and {addressQ} (URL-encoded) in every string of `v`; used for page text so the address is edited in one place. */
export function fillAddress<T>(v: T, address: string): T {
  // Most pages have no token at all: skip the deep copy (checked once, at the top).
  return v && typeof v === "object" && !/\{(address|street|addressQ)\}/.test(JSON.stringify(v)) ? v : fill(v, address);
}
function fill<T>(v: T, address: string): T {
  if (typeof v === "string") return v.replaceAll("{addressQ}", encodeURIComponent(address)).replaceAll("{street}", address.split(",")[0]).replaceAll("{address}", address) as T;
  if (Array.isArray(v)) return v.map((x) => fill(x, address)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, address)])) as T;
  return v;
}
