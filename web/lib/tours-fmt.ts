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

export type StatRow = { day: string; dow: number; hr: number; status: string; cancelled: boolean; held: boolean; walkup: boolean; interest: string; heard: string; guide: string; guide_email: string; close_days: number | null; est: boolean };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const tally = (keys: string[]) => Object.entries(keys.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const addDays = (d: string, n: number) => new Date(+new Date(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Tour stats from one row per booking. Rates only count tours that have happened (`held`); "closed" = signed up; the closer is the guide (grouped by email, else name).
 *  `series` has one bucket for every day from the range start to `today` (weekly beyond 120 days), zeros included. */
export function summarize(rows: StatRow[], days: number, today: string) {
  const live = rows.filter((r) => !r.cancelled), held = live.filter((r) => r.held), won = live.filter((r) => r.status === "signed_up");
  const start = days ? addDays(today, 1 - days) : rows[0]?.day ?? today, weekly = (+new Date(today) - +new Date(start)) / 864e5 > 120;
  const bucket = (d: string) => (weekly ? addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7)) : d), counts = new Map<string, number>();
  for (const r of rows) counts.set(bucket(r.day), (counts.get(bucket(r.day)) ?? 0) + 1);
  const series: [string, number][] = [];
  for (let d = bucket(start); d <= today; d = addDays(d, weekly ? 7 : 1)) series.push([d, counts.get(d) ?? 0]);
  const who = (r: StatRow) => r.guide_email.trim().toLowerCase() || r.guide.trim().toLowerCase() || "none";
  const names = new Map<string, string>(); for (const r of live) if (!names.get(who(r)) || r.guide) names.set(who(r), r.guide || r.guide_email || "No guide");
  const closers = [...new Set(held.map(who))].map((k) => {
    const h = held.filter((r) => who(r) === k), w = h.filter((r) => r.status === "signed_up");
    return { name: names.get(k) ?? "No guide", tours: h.length, won: w.length, days: mean(w.map((r) => r.close_days ?? 0)) };
  }).sort((a, b) => b.won - a.won || b.tours - a.tours);
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0)); for (const r of rows) heat[r.dow][r.hr]++;
  return {
    total: rows.length, cancelled: rows.length - live.length, held: held.length, won: won.length, estimated: won.filter((r) => r.est).length, days: mean(won.map((r) => r.close_days ?? 0)),
    walkupTours: live.filter((r) => r.walkup).length, noShow: held.filter((r) => r.status === "no_show").length, funnel: tally(live.map((r) => r.status)),
    closers, interests: tally(live.flatMap((r) => (r.interest ? r.interest.split(", ") : []))), heard: tally(live.map((r) => r.heard || "Not said")), series, weekly, heat,
  };
}

/** Minimal RFC-4180 parser: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const AREA_MAP: Record<string, string> = { woodshop: "Wood shop", "metal shop / machine shop": "Metal shop", "welding shop": "Metal shop", "laser cutting / engraving": "Laser shop", "3d printing": "3D printing", "craft room": "Craft room", "electronics equipment": "Electronics" };

/** Sign-up sheet rows (Timestamp, First, Last, Membership, Areas, Phone, Email, Contact, Heard, _, Purpose, Comments) to walk-up requests. Rows without a name, email or valid M/D/YYYY time are returned in `skipped`. */
export function csvToRequests(text: string) {
  const out: { first: string; last: string; email: string; phone: string; contact: string; interest: string; notes: string; at: string }[] = [], skipped: string[] = [];
  for (const r of parseCsv(text).slice(1)) {
    const [ts, first, last, member, areas, phone, email, contact, heard, , purpose, comments] = r.map((c) => (c ?? "").trim());
    const m = ts?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m || !first || !EMAIL.test(email.toLowerCase())) { skipped.push(`${first} ${last} ${email}`.trim() || ts || "blank row"); continue; }
    const p = (n: string | undefined) => (n ?? "0").padStart(2, "0");
    const parts = areas.split(",").map((a) => a.trim()).filter(Boolean), known = new Set(parts.map((a) => AREA_MAP[a.toLowerCase()]).filter(Boolean)), other = parts.filter((a) => !AREA_MAP[a.toLowerCase()]);
    const notes = [member && `Wants: ${member}`, heard && `Heard about us: ${heard}`, other.length && `Also interested in: ${other.join(", ")}`, purpose && `Why: ${purpose}`, comments && `Comments: ${comments}`, "Imported from sign-up sheet"].filter(Boolean).join("\n").slice(0, 1000);
    out.push({ first: first.slice(0, 60), last: last.slice(0, 60), email: email.toLowerCase().slice(0, 200), phone: phone.slice(0, 30), contact: /^phone/i.test(contact) ? "Phone call" : "Text message", interest: [...known].join(", "), notes, at: `${m[3]}-${p(m[1])}-${p(m[2])} ${p(m[4])}:${p(m[5])}:${p(m[6])}` });
  }
  return { rows: out, skipped };
}
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Writes walk-ups in the sign-up sheet's column order, so an export can be imported again (same email + time is skipped). */
export function requestsToCsv(rows: { first_name: string; last_name: string; interest: string; phone: string; email: string; contact_method: string; heard?: string; notes: string; created_at: Date | string }[]) {
  const when = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["Timestamp", "First Name", "Last Name", "Desired Membership", "Area of Interest (Select all that apply)", "Phone", "Email", "Contact", "Heard About Us", "", "Purpose", "Comments"];
  const lines = rows.map((r) => {
    const p = Object.fromEntries(when.formatToParts(new Date(r.created_at)).map((x) => [x.type, x.value]));
    const ts = `${p.month}/${p.day}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
    return [ts, r.first_name, r.last_name, "", r.interest, r.phone, r.email, /^phone/i.test(r.contact_method) ? "Phone" : "Text", r.heard ?? "", "", "", r.notes].map((c) => cell(c ?? "")).join(",");
  });
  return [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}

// ---- availability and bookings as CSV (same columns in and out, so an export can be imported again)
const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
/** YYYY-MM-DD or M/D/YYYY to YYYY-MM-DD, else "". */
export const normDate = (s: string) => {
  const t = s.trim(), iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), p = (n: string) => n.padStart(2, "0");
  const d = iso ? `${iso[1]}-${p(iso[2])}-${p(iso[3])}` : us ? `${us[3]}-${p(us[1])}-${p(us[2])}` : "";
  return DATE.test(d) && !isNaN(+new Date(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d ? d : ""; // real calendar days only
};
/** 14:30, 2:30 PM or 2:30pm to HH:mm, else "". */
export const normTime = (s: string) => {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?$/i);
  if (!m) return "";
  let h = +m[1];
  if (m[3]) { if (h < 1 || h > 12) return ""; h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0); }
  const t = `${String(h).padStart(2, "0")}:${m[2]}`;
  return TIME.test(t) ? t : "";
};
const body = (text: string) => parseCsv(text).slice(1).map((r) => r.map((c) => (c ?? "").trim()));

export const BLOCK_HEAD = ["Date", "Start", "End", "Minutes per tour", "People per tour", "Guide name", "Guide email"];
export function blocksToCsv(rows: { date: string; start_time: string; end_time: string; slot_minutes: number; max_per_slot: number; guide_name: string; guide_email: string }[]) {
  return toCsv(BLOCK_HEAD, rows.map((b) => [b.date, b.start_time, b.end_time, b.slot_minutes, b.max_per_slot, b.guide_name, b.guide_email]));
}
export function csvToBlocks(text: string) {
  const out: { date: string; start_time: string; end_time: string; slot_minutes: number; max_per_slot: number; guide_name: string; guide_email: string }[] = [], skipped: string[] = [];
  for (const [date, start, end, mins, per, guide, gmail] of body(text)) {
    const d = normDate(date ?? ""), s = normTime(start ?? ""), e = normTime(end ?? "");
    if (!d || !s || !e) { skipped.push(`${date} ${start}-${end}`.trim() || "blank row"); continue; }
    out.push({ date: d, start_time: s, end_time: e, slot_minutes: +mins || 30, max_per_slot: +per || 1, guide_name: (guide ?? "").slice(0, 100), guide_email: (gmail ?? "").toLowerCase().slice(0, 200) });
  }
  return { rows: out, skipped };
}

export const BOOKING_HEAD = ["Date", "Start", "First name", "Last name", "Email", "Phone", "Zip", "Contact", "Areas", "Heard", "Notes", "Status", "Guide email"];
export function bookingsToCsv(rows: { date: string; start_time: string; first_name: string; last_name: string; email: string; phone: string; zip: string; contact_method: string; interest: string; heard: string; visitor_notes: string; status: string; guide_email: string }[]) {
  return toCsv(BOOKING_HEAD, rows.map((r) => [r.date, r.start_time, r.first_name, r.last_name, r.email, r.phone, r.zip, r.contact_method, r.interest, r.heard, r.visitor_notes, r.status, r.guide_email]));
}
export function csvToBookings(text: string) {
  const out: { date: string; start: string; first: string; last: string; email: string; phone: string; zip: string; contact: string; interest: string; heard: string; notes: string; status: string; guide_email: string }[] = [], skipped: string[] = [];
  for (const [date, start, first, last, email, phone, zip, contact, areas, heard, notes, status, gmail] of body(text)) {
    const d = normDate(date ?? ""), s = normTime(start ?? "");
    if (!d || !s || !(first || last) || !EMAIL.test((email ?? "").toLowerCase())) { skipped.push(`${first ?? ""} ${last ?? ""} ${email ?? ""}`.trim() || date || "blank row"); continue; }
    out.push({ date: d, start: s, first: (first ?? "").slice(0, 60), last: (last ?? "").slice(0, 60), email: email.toLowerCase().slice(0, 200), phone: (phone ?? "").slice(0, 30), zip: (zip ?? "").slice(0, 10), contact: contact ?? "", interest: areas ?? "", heard: heard ?? "",
      notes: (notes ?? "").slice(0, 1000), status: (status ?? "").toLowerCase().replace(/[\s-]+/g, "_"), guide_email: (gmail ?? "").toLowerCase() });
  }
  return { rows: out, skipped };
}

/** The reset of someone's membership is for staff signed in with a kzoomakers.org address ("dev" is the local-development admin, which only exists outside production). */
export const isStaffEmail = (email: string) => /@kzoomakers\.org$/i.test(email) || email === "dev";
