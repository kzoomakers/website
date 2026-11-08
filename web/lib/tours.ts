import { randomBytes } from "crypto";
import { db } from "./db";
import { notify, TOURS_TOPIC } from "./ntfy";
import { checkOffers, DATE, fmtOffer, mins, TIME, TZ, type Offer } from "./tours-fmt";
import { getMailCfg, mailReady, sendQueued as send } from "./mail";

// Tour scheduling, ported from kzoomakers/schedulingapp (tours only). Guides publish availability blocks; slots are derived from
// block start/end/length instead of stored, and visitors book a slot. Skipped from the original: SMS, surveys, ban list, reCAPTCHA.
export { TZ };
export const MIN_ADVANCE_H = 4, WINDOW_DAYS = 28;
export const AREAS = ["Wood shop", "Metal shop", "Laser shop", "3D printing", "Craft room", "Electronics", "Meeting space"];
export const CONTACT = ["Email", "Phone call", "Text message"];
export const HEARD = ["Friend or member", "Web search", "Social media", "Event or class", "Flyer or poster", "Other"];
export const STATUSES = ["booked", "no_show", "signed_up", "sign_up_later", "maybe_later", "no_interest"] as const;

export type Block = { future: number; id: number; date: string; start_time: string; end_time: string; slot_minutes: number; max_per_slot: number; guide_name: string; guide_email: string; booked: number };
export type Booking = { id: number; block_id: number; date: string; start_time: string; name: string; email: string; phone: string; interest: string; heard: string; status: string; visitor_notes: string; client_ip: string; user_agent: string; screen: string; created_at: string; guide_name: string; msgs: number; last_from: string | null };
export type Device = { ip: string; ua: string; screen: string };
export type Msg = { id: number; kind: "staff" | "visitor" | "note"; author: string; body: string; created_at: string };
export type { Offer };
export { fmtOffer };
export type WalkupRequest = { id: number; first_name: string; last_name: string; email: string; phone: string; zip: string; contact_method: string; interest: string; notes: string; status: string;
  reschedules: number; offers: Offer[]; guide_name: string; decline_note: string; client_ip: string; user_agent: string; screen: string; created_at: string; msgs: number; last_from: string | null };

const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const GOOGLE_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSekvaWfF6zHaQ50nkNLbj131irosv6RQnRCT0qzNWXDnn2y3Q/viewform";

let ready: Promise<unknown> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= (async () => {
    const p = d.pool;
    await p.query(`CREATE TABLE IF NOT EXISTS tour_blocks (id serial PRIMARY KEY, date text NOT NULL, start_time text NOT NULL, end_time text NOT NULL, slot_minutes int NOT NULL,
      max_per_slot int NOT NULL DEFAULT 1, guide_name text NOT NULL DEFAULT '', guide_email text NOT NULL DEFAULT '', created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
    await p.query(`CREATE TABLE IF NOT EXISTS tour_bookings (id serial PRIMARY KEY, block_id int NOT NULL REFERENCES tour_blocks ON DELETE CASCADE, start_time text NOT NULL,
      name text NOT NULL, email text NOT NULL, phone text NOT NULL DEFAULT '', interest text NOT NULL DEFAULT '', heard text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'booked',
      cancelled boolean NOT NULL DEFAULT false, notes text NOT NULL DEFAULT '', token text NOT NULL UNIQUE, ip_hash text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
    await p.query("ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS visitor_notes text NOT NULL DEFAULT ''");
    // Walk-ups: people who asked for a tour when no times were open. A volunteer offers dates, the visitor picks one (which becomes an ordinary block + booking) or sends it back.
    await p.query(`CREATE TABLE IF NOT EXISTS tour_requests (id serial PRIMARY KEY, first_name text NOT NULL, last_name text NOT NULL, email text NOT NULL, phone text NOT NULL, zip text NOT NULL DEFAULT '',
      contact_method text NOT NULL DEFAULT 'Email', interest text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', reschedules int NOT NULL DEFAULT 0,
      offers jsonb NOT NULL DEFAULT '[]', guide_name text NOT NULL DEFAULT '', guide_email text NOT NULL DEFAULT '', decline_note text NOT NULL DEFAULT '', token text NOT NULL UNIQUE,
      booking_id int, ip_hash text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
    for (const t of ["tour_bookings", "tour_requests"]) await p.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS client_ip text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS user_agent text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS screen text NOT NULL DEFAULT ''`);
    // One conversation per booking or walk-up request: staff emails, visitor replies (via a token link), and internal notes only staff see.
    await p.query(`CREATE TABLE IF NOT EXISTS tour_messages (id serial PRIMARY KEY, kind text NOT NULL, ref_id int NOT NULL, author_kind text NOT NULL, author text NOT NULL DEFAULT '', body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now())`);
    await p.query("CREATE INDEX IF NOT EXISTS tour_messages_ref ON tour_messages (kind, ref_id)");
    // The old per-booking notes box becomes the first internal note.
    await p.query("INSERT INTO tour_messages (kind, ref_id, author_kind, author, body) SELECT 'booking', id, 'note', 'earlier note', notes FROM tour_bookings k WHERE notes <> '' AND NOT EXISTS (SELECT 1 FROM tour_messages m WHERE m.kind = 'booking' AND m.ref_id = k.id AND m.author = 'earlier note')");
    await p.query("CREATE INDEX IF NOT EXISTS tour_bookings_block ON tour_bookings (block_id)");
    // The Google Form is retired: point the menu link and the redirect page at the new booking page.
    await p.query("UPDATE settings SET data = replace(data::text, $1, '/tours')::jsonb WHERE key = 'menu'", [GOOGLE_FORM]);
    await p.query("UPDATE pages SET data = replace(data::text, $1, '/tours')::jsonb WHERE slug = 'tour-form-redirect'", [GOOGLE_FORM]);
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const slotStarts = (b: { start_time: string; end_time: string; slot_minutes: number }) => {
  const out: string[] = [];
  for (let m = mins(b.start_time); m + b.slot_minutes <= mins(b.end_time); m += b.slot_minutes) out.push(hhmm(m));
  return out;
};
/** Wall-clock "YYYY-MM-DD HH:mm" in the space's timezone, offset by `h` hours; sorts as text. */
export const localNow = (h = 0) => new Date(Date.now() + h * 3600e3).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16);

const BLOCKS = `SELECT b.id, b.date, b.start_time, b.end_time, b.slot_minutes, b.max_per_slot, b.guide_name, b.guide_email,
  (SELECT count(*)::int FROM tour_bookings k WHERE k.block_id = b.id AND NOT k.cancelled) AS booked FROM tour_blocks b`;

export async function listBlocks(past: boolean): Promise<Block[]> {
  // future = people booked into tours that haven't started: the ones a delete would cancel.
  return (await (await conn()).query(`SELECT b.*, (SELECT count(*)::int FROM tour_bookings k WHERE k.block_id = b.id AND NOT k.cancelled AND b.date || ' ' || k.start_time >= $3) AS future
    FROM (${BLOCKS}) b WHERE ($1 OR b.date >= $2) ORDER BY b.date ${past ? "DESC" : ""}, b.start_time`, [past, localNow().slice(0, 10), localNow()])).rows;
}

export async function saveBlock(x: any, who: string) {
  const b = { date: String(x.date ?? ""), start_time: String(x.start_time ?? ""), end_time: String(x.end_time ?? ""), slot_minutes: Number(x.slot_minutes), max_per_slot: Number(x.max_per_slot),
    guide_name: String(x.guide_name ?? "").trim().slice(0, 100), guide_email: String(x.guide_email ?? "").trim().slice(0, 200) };
  if (!DATE.test(b.date) || !TIME.test(b.start_time) || !TIME.test(b.end_time)) throw new Error("Pick a date and start and end times.");
  if (!Number.isInteger(b.slot_minutes) || b.slot_minutes < 5 || b.slot_minutes > 480 || !Number.isInteger(b.max_per_slot) || b.max_per_slot < 1 || b.max_per_slot > 50) throw new Error("Check the tour length and the number of people per tour.");
  if (b.guide_email && !EMAIL_OK.test(b.guide_email)) throw new Error("The guide's email doesn't look right.");
  const starts = slotStarts(b);
  if (!starts.length) throw new Error("The block is too short for even one tour.");
  const c = await conn();
  if (x.id) {
    // Changing times must not strand someone who already booked a slot that would disappear.
    const stranded = (await c.query("SELECT 1 FROM tour_bookings WHERE block_id = $1 AND NOT cancelled AND NOT (start_time = ANY($2)) LIMIT 1", [x.id, starts])).rowCount;
    if (stranded) throw new Error("Someone has booked a time that this change would remove. Cancel their booking first.");
    if ((await c.query("SELECT 1 FROM tour_bookings WHERE block_id = $1 AND NOT cancelled GROUP BY start_time HAVING count(*) > $2", [x.id, b.max_per_slot])).rowCount) throw new Error("A tour already has more people booked than that.");
    if (!(await c.query("UPDATE tour_blocks SET date=$2, start_time=$3, end_time=$4, slot_minutes=$5, max_per_slot=$6, guide_name=$7, guide_email=$8 WHERE id=$1", [x.id, b.date, b.start_time, b.end_time, b.slot_minutes, b.max_per_slot, b.guide_name, b.guide_email])).rowCount) throw new Error("No such block.");
  } else await c.query("INSERT INTO tour_blocks (date, start_time, end_time, slot_minutes, max_per_slot, guide_name, guide_email, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [b.date, b.start_time, b.end_time, b.slot_minutes, b.max_per_slot, b.guide_name, b.guide_email, who]);
}

/** Deleting blocks cancels everyone booked into tours that haven't started. Each is emailed a rebook link; walk-up visitors go back in line for a volunteer instead. */
export async function deleteBlocks(ids: unknown, base: string) {
  const list = (Array.isArray(ids) ? ids : []).filter(Number.isInteger) as number[];
  if (!list.length) return { blocks: 0, people: 0 };
  await conn();
  const client = await db()!.pool.connect();
  let people: any[], blocks = 0;
  const walk = new Set<number>();
  try {
    await client.query("BEGIN");
    await client.query("SELECT 1 FROM tour_blocks WHERE id = ANY($1) FOR UPDATE", [list]); // a booking made right now waits, so nobody is deleted unnotified
    people = (await client.query("SELECT k.id, k.name, k.email, k.start_time, b.date FROM tour_bookings k JOIN tour_blocks b ON b.id = k.block_id WHERE b.id = ANY($1) AND NOT k.cancelled AND b.date || ' ' || k.start_time >= $2", [list, localNow()])).rows;
    for (const r of (await client.query("UPDATE tour_requests SET status = 'open', offers = '[]', booking_id = NULL, reschedules = reschedules + 1 WHERE booking_id = ANY($1) RETURNING booking_id", [people.map((p) => p.id)])).rows) walk.add(r.booking_id);
    blocks = (await client.query("DELETE FROM tour_blocks WHERE id = ANY($1)", [list])).rowCount ?? 0;
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  for (const p of people) {
    const w = when(p.date, p.start_time), sorry = `Hi ${p.name}, we're sorry: the volunteer who was going to give your tour on ${w} can no longer make it, so it's cancelled.`;
    await (walk.has(p.id)
      ? mail(p.email, "Your Kzoo Makers tour needs a new time", [sorry, "We've put your request back in line, and a volunteer will email you new dates soon."])
      : mail(p.email, "Your Kzoo Makers tour was cancelled", [sorry, "Please pick another time. If none are open, you'll be able to request a tour and a volunteer will offer you dates."], ["Rebook your tour", `${base}/tours`]));
  }
  if (people.length) await notify(TOURS_TOPIC, { title: `${people.length} tour(s) cancelled`, message: `${blocks} availability block(s) were deleted. ${people.map((p) => p.name).join(", ")} were emailed to rebook.`, tags: "warning", priority: 4 });
  return { blocks, people: people.length };
}

/** Open tours in the booking window, minus full and too-soon ones. */
export async function openSlots() {
  const c = await conn(), from = localNow(MIN_ADVANCE_H), to = localNow(WINDOW_DAYS * 24).slice(0, 10);
  const blocks = (await c.query(`${BLOCKS} WHERE b.date >= $1 AND b.date <= $2 ORDER BY b.date, b.start_time`, [from.slice(0, 10), to])).rows as Block[];
  const taken = (await c.query("SELECT block_id, start_time, count(*)::int AS n FROM tour_bookings WHERE NOT cancelled GROUP BY 1, 2")).rows;
  const used = new Map(taken.map((r) => [`${r.block_id}|${r.start_time}`, r.n as number]));
  return blocks.flatMap((b) => slotStarts(b).filter((s) => `${b.date} ${s}` >= from).map((s) => ({
    block: b.id, date: b.date, start: s, end: hhmm(mins(s) + b.slot_minutes), left: b.max_per_slot - (used.get(`${b.id}|${s}`) ?? 0) })).filter((s) => s.left > 0));
}

export async function listBookings(past: boolean): Promise<Booking[]> {
  return (await (await conn()).query(`SELECT k.id, k.block_id, b.date, k.start_time, k.name, k.email, k.phone, k.interest, k.heard,
    CASE WHEN k.cancelled THEN 'cancelled' ELSE k.status END AS status, k.visitor_notes, k.client_ip, k.user_agent, k.screen, k.created_at, b.guide_name, (SELECT count(*)::int FROM tour_messages m WHERE m.kind = 'booking' AND m.ref_id = k.id AND m.author_kind <> 'note') AS msgs, (SELECT m.author_kind FROM tour_messages m WHERE m.kind = 'booking' AND m.ref_id = k.id ORDER BY m.id DESC LIMIT 1) AS last_from
    FROM tour_bookings k JOIN tour_blocks b ON b.id = k.block_id WHERE ($1 OR b.date >= $2) ORDER BY b.date ${past ? "DESC" : ""}, k.start_time, k.id`, [past, localNow().slice(0, 10)])).rows;
}

export async function setStatus(id: number, status: string) {
  if (!(STATUSES as readonly string[]).includes(status)) throw new Error("bad status");
  if (!(await (await conn()).query("UPDATE tour_bookings SET status = $2 WHERE id = $1 AND NOT cancelled", [id, status])).rowCount) throw new Error("That booking is cancelled or gone.");
}

// ---- email (best effort: a booking is never lost because mail failed)
async function mail(to: string, subject: string, lines: string[], link?: [string, string]) {
  try {
    const cfg = await getMailCfg();
    if (!mailReady(cfg) || !to) return;
    const html = lines.map((l) => `<p>${esc(l)}</p>`).join("") + (link ? `<p><a href="${esc(link[1])}">${esc(link[0])}</a></p>` : "");
    await send({ to, subject, text: lines.join("\n\n") + (link ? `\n\n${link[0]}: ${link[1]}` : ""), html }, cfg);
  } catch (e) { console.error("tour email failed:", e); }
}
const when = (date: string, start: string) => new Date(`${date}T${start}:00Z`).toLocaleString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A visitor books a tour. Locks the block so two people can't take the last place. */
export async function book(x: { block: number; start: string; name: string; email: string; phone: string; areas: string[]; heard: string; notes?: string }, ipHash: string, dev: Device, base: string) {
  const name = x.name.trim().slice(0, 100), email = x.email.trim().toLowerCase().slice(0, 200), phone = x.phone.trim().slice(0, 30);
  if (!name || !EMAIL_OK.test(email)) throw new Error("Please enter your name and a valid email address.");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("Please enter a phone number with 10 digits.");
  const interest = x.areas.filter((a) => AREAS.includes(a)).join(", "), heard = HEARD.includes(x.heard) ? x.heard : "", vnotes = (x.notes ?? "").trim().slice(0, 1000);
  await conn();
  const client = await db()!.pool.connect(), token = randomBytes(24).toString("hex");
  let b: Block | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [x.block]);
    const recent = (await client.query("SELECT count(*) FILTER (WHERE ip_hash = $1)::int AS mine, count(*)::int AS everyone FROM tour_bookings WHERE created_at > now() - interval '1 hour'", [ipHash])).rows[0];
    if (recent.mine >= 5 || recent.everyone >= 40) throw new Error("Too many bookings right now. Please try again later.");
    b = (await client.query(`${BLOCKS} WHERE b.id = $1`, [x.block])).rows[0];
    if (!b || !slotStarts(b).includes(x.start) || `${b.date} ${x.start}` < localNow(MIN_ADVANCE_H)) throw new Error("That time is no longer available.");
    if ((await client.query("SELECT 1 FROM tour_bookings WHERE block_id = $1 AND start_time = $2 AND email = $3 AND NOT cancelled", [b.id, x.start, email])).rowCount) throw new Error("You're already booked for that tour.");
    const n = (await client.query("SELECT count(*)::int AS n FROM tour_bookings WHERE block_id = $1 AND start_time = $2 AND NOT cancelled", [b.id, x.start])).rows[0].n;
    if (n >= b.max_per_slot) throw new Error("Sorry, that tour just filled up. Please pick another time.");
    await client.query("INSERT INTO tour_bookings (block_id, start_time, name, email, phone, interest, heard, token, ip_hash, visitor_notes, client_ip, user_agent, screen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [b.id, x.start, name, email, phone, interest, heard, token, ipHash, vnotes, dev.ip, dev.ua, dev.screen]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  const w = when(b.date, x.start);
  await mail(email, "Your Kzoo Makers tour", [`Hi ${name}, you're booked for a tour on ${w}.`, "If your plans change, please cancel so someone else can have the spot."], ["Cancel this tour", `${base}/tours/cancel?token=${token}`]);
  await mail(b.guide_email, `New tour booking: ${name}`, [`${name} (${email}, ${phone}) booked a tour on ${w}.`, interest && `Interested in: ${interest}`, vnotes && `Notes: ${vnotes}`].filter(Boolean) as string[]);
  await notify(TOURS_TOPIC, { title: `Tour booked: ${name}`, message: `${w}\n${name} · ${email} · ${phone}${interest ? `\nInterested in: ${interest}` : ""}`, tags: "calendar", click: `${base}/admin/tours` });
  return { date: b.date, start: x.start };
}

export async function cancelByToken(token: string, confirm: boolean) {
  const c = await conn();
  const r = (await c.query(`SELECT k.id, k.name, k.cancelled, k.start_time, b.date, b.guide_email FROM tour_bookings k JOIN tour_blocks b ON b.id = k.block_id WHERE k.token = $1`, [token])).rows[0];
  if (!r) throw new Error("This cancel link isn't valid.");
  if (confirm && !r.cancelled) {
    await c.query("UPDATE tour_bookings SET cancelled = true WHERE id = $1", [r.id]);
    await c.query("UPDATE tour_requests SET status = 'closed' WHERE booking_id = $1", [r.id]); // a walk-up that cancels is no longer waiting for a tour
    await mail(r.guide_email, `Tour cancelled: ${r.name}`, [`${r.name} cancelled their tour on ${when(r.date, r.start_time)}.`]);
    await notify(TOURS_TOPIC, { title: `Tour cancelled: ${r.name}`, message: when(r.date, r.start_time), tags: "x", priority: 2 });
  }
  return { when: when(r.date, r.start_time), cancelled: confirm || r.cancelled };
}

export async function cancelBooking(id: number) {
  const c = await conn();
  const r = (await c.query("UPDATE tour_bookings SET cancelled = true WHERE id = $1 AND NOT cancelled RETURNING name, email, start_time, block_id", [id])).rows[0];
  if (!r) throw new Error("Already cancelled.");
  await c.query("UPDATE tour_requests SET status = 'closed' WHERE booking_id = $1", [id]);
  const b = (await c.query("SELECT date FROM tour_blocks WHERE id = $1", [r.block_id])).rows[0];
  await mail(r.email, "Your Kzoo Makers tour was cancelled", [`Hi ${r.name}, your tour on ${when(b.date, r.start_time)} has been cancelled. Sorry for the trouble. You're welcome to book another time at kzoomakers.org/tours.`]);
}

// ---- walk-up requests
const CONTACT_PREFS = new Set(CONTACT);

export async function requestTour(x: Record<string, unknown>, ipHash: string, dev: Device, base: string) {
  const s = (k: string, n: number) => (typeof x[k] === "string" ? (x[k] as string).trim().slice(0, n) : "");
  const r = { first: s("first", 60), last: s("last", 60), email: s("email", 200).toLowerCase(), phone: s("phone", 30), zip: s("zip", 10), contact: s("contact", 20), notes: s("notes", 1000) };
  if (!r.first || !r.last || !EMAIL_OK.test(r.email)) throw new Error("Please enter your first and last name and a valid email address.");
  if (r.phone.replace(/\D/g, "").length < 10) throw new Error("Please enter a phone number with 10 digits.");
  if (!/^\d{5}(-\d{4})?$/.test(r.zip)) throw new Error("Please enter a 5-digit zip code.");
  const interest = (Array.isArray(x.areas) ? (x.areas as unknown[]) : []).filter((a): a is string => typeof a === "string" && AREAS.includes(a)).join(", "), contact = CONTACT_PREFS.has(r.contact) ? r.contact : "Email";
  const c = await conn();
  const recent = (await c.query("SELECT count(*) FILTER (WHERE ip_hash = $1)::int AS mine, count(*)::int AS everyone FROM tour_requests WHERE created_at > now() - interval '1 hour'", [ipHash])).rows[0];
  if (recent.mine >= 5 || recent.everyone >= 40) throw new Error("Too many requests right now. Please try again later.");
  await c.query("INSERT INTO tour_requests (first_name, last_name, email, phone, zip, contact_method, interest, notes, token, ip_hash, client_ip, user_agent, screen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [r.first, r.last, r.email, r.phone, r.zip, contact, interest, r.notes, randomBytes(24).toString("hex"), ipHash, dev.ip, dev.ua, dev.screen]);
  await notify(TOURS_TOPIC, { title: `Tour request: ${r.first} ${r.last}`, message: `${r.email} · ${r.phone} (prefers ${contact})${interest ? `\nInterested in: ${interest}` : ""}`, tags: "raising_hand", click: `${base}/admin/tours/walkups` });
}

export async function listRequests(all: boolean): Promise<WalkupRequest[]> {
  return (await (await conn()).query(`SELECT id, first_name, last_name, email, phone, zip, contact_method, interest, notes, status, reschedules, offers, guide_name, decline_note, client_ip, user_agent, screen, created_at, (SELECT count(*)::int FROM tour_messages m WHERE m.kind = 'request' AND m.ref_id = tour_requests.id AND m.author_kind <> 'note') AS msgs, (SELECT m.author_kind FROM tour_messages m WHERE m.kind = 'request' AND m.ref_id = tour_requests.id ORDER BY m.id DESC LIMIT 1) AS last_from
    FROM tour_requests WHERE ($1 OR status IN ('open','offered')) ORDER BY created_at`, [all])).rows;
}

/** A volunteer proposes dates; the visitor is emailed one link per option plus a "none of these work" link. */
export async function offerTimes(id: number, raw: unknown, guide: { name: string; email: string }, base: string) {
  const c = await conn(), cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email isn't set up yet, so the offer can't be sent. An admin can fix this under Services.");
  const offers = checkOffers(raw, localNow(MIN_ADVANCE_H));
  const gname = guide.name.trim().slice(0, 100), gemail = EMAIL_OK.test(guide.email.trim()) ? guide.email.trim().slice(0, 200) : "";
  if (!gemail) throw new Error("Enter your email so the visitor's confirmation reaches you.");
  const r = (await c.query("UPDATE tour_requests SET offers = $2, status = 'offered', guide_name = $3, guide_email = $4 WHERE id = $1 AND status IN ('open','offered') RETURNING first_name, email, token, reschedules", [id, JSON.stringify(offers), gname, gemail])).rows[0];
  if (!r) throw new Error("That request was already scheduled or closed.");
  const link = `${base}/tours/respond?token=${r.token}`, intro = `Good news! We found a volunteer${gname ? ` (${gname})` : ""} who wants to give you a tour. Here are the dates available to them, click if this works for you:`;
  const outro = "If these don't work for you, click here to request other available times, and your request will go back to the volunteers.";
  const html = `<p>Hi ${esc(r.first_name)},</p><p>${esc(intro)}</p><ul>${offers.map((o, i) => `<li><a href="${esc(link)}&pick=${i}">${esc(fmtOffer(o))}</a></li>`).join("")}</ul><p><a href="${esc(link)}&none=1">${esc(outro)}</a></p>`;
  const text = `Hi ${r.first_name},\n\n${intro}\n\n${offers.map((o, i) => `* ${fmtOffer(o)}\n  ${link}&pick=${i}`).join("\n")}\n\n${outro}\n${link}&none=1`;
  await send({ to: r.email, subject: "Good news! A Kzoo Makers volunteer can give you a tour", text, html }, cfg);
}

export const setRequestStatus = async (id: number, status: "open" | "closed") => {
  if (!(await (await conn()).query("UPDATE tour_requests SET status = $2, offers = '[]' WHERE id = $1 AND status <> 'scheduled'", [id, status])).rowCount) throw new Error("That request is already scheduled.");
};

/** What the visitor's response page needs. Offers that have already passed are dropped. */
export async function requestByToken(token: string) {
  const r = (await (await conn()).query("SELECT first_name, status, offers, guide_name FROM tour_requests WHERE token = $1", [token])).rows[0];
  if (!r) throw new Error("This link isn't valid.");
  const now = localNow();
  return { name: r.first_name as string, status: r.status as string, guide: r.guide_name as string,
    offers: (r.offers as Offer[]).map((o, i) => ({ i, label: fmtOffer(o), past: `${o.date} ${o.start}` < now })) };
}

/** The visitor picks option `pick` (it becomes a normal block + booking) or, with pick = null, sends the request back to the queue. */
export async function respond(token: string, pick: number | null, note: string, base: string) {
  await conn();
  const client = await db()!.pool.connect();
  let r: any, o: Offer | undefined, bookingToken = randomBytes(24).toString("hex");
  try {
    await client.query("BEGIN");
    r = (await client.query("SELECT * FROM tour_requests WHERE token = $1 FOR UPDATE", [token])).rows[0];
    if (!r) throw new Error("This link isn't valid.");
    if (r.status === "scheduled") throw new Error("You've already picked a time. Check your email for the confirmation.");
    if (r.status !== "offered") throw new Error("These times are no longer on offer. A volunteer will be in touch if new ones come up.");
    if (pick === null) {
      await client.query("UPDATE tour_requests SET status = 'open', offers = '[]', reschedules = reschedules + 1, decline_note = $2 WHERE id = $1", [r.id, note.trim().slice(0, 500)]);
    } else {
      o = r.offers[pick];
      if (!o || `${o.date} ${o.start}` < localNow()) throw new Error("That time has passed. Please request other times instead.");
      const blk = (await client.query("INSERT INTO tour_blocks (date, start_time, end_time, slot_minutes, max_per_slot, guide_name, guide_email, created_by) VALUES ($1,$2,$3,$4,1,$5,$6,'walk-up') RETURNING id",
        [o.date, o.start, o.end, mins(o.end) - mins(o.start), r.guide_name, r.guide_email])).rows[0].id;
      const bk = (await client.query("INSERT INTO tour_bookings (block_id, start_time, name, email, phone, interest, token, visitor_notes, client_ip, user_agent, screen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
        [blk, o.start, `${r.first_name} ${r.last_name}`, r.email, r.phone, r.interest, bookingToken, r.notes, r.client_ip, r.user_agent, r.screen])).rows[0].id;
      await client.query("UPDATE tour_requests SET status = 'scheduled', booking_id = $2 WHERE id = $1", [r.id, bk]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  const name = `${r.first_name} ${r.last_name}`;
  if (!o) {
    await notify(TOURS_TOPIC, { title: `Tour request needs new times: ${name}`, message: `They have asked for new times ${r.reschedules + 1} time(s).${note ? `\n"${note}"` : ""}`, tags: "arrows_counterclockwise", click: `${base}/admin/tours/walkups` });
    return { declined: true as const };
  }
  const w = fmtOffer(o);
  await mail(r.email, "Your Kzoo Makers tour", [`Hi ${r.first_name}, you're booked for a tour on ${w}.`, "If your plans change, please cancel so we can offer the time to someone else."], ["Cancel this tour", `${base}/tours/cancel?token=${bookingToken}`]);
  await mail(r.guide_email, `Tour confirmed: ${name}`, [`${name} (${r.email}, ${r.phone}) accepted your tour time: ${w}.`, r.interest && `Interested in: ${r.interest}`, r.notes && `Notes: ${r.notes}`].filter(Boolean) as string[]);
  await notify(TOURS_TOPIC, { title: `Walk-up tour confirmed: ${name}`, message: w, tags: "calendar", click: `${base}/admin/tours` });
  return { declined: false as const, when: w };
}

// ---- conversations (any booking or walk-up request)
type Kind = "booking" | "request";
const KINDS = ["booking", "request"];
/** The visitor behind a booking or request, and the staff address to notify. */
async function party(kind: Kind, id: number) {
  const c = await conn();
  const r = (await (kind === "booking"
    ? c.query("SELECT k.name, k.email, k.token, b.guide_email FROM tour_bookings k JOIN tour_blocks b ON b.id = k.block_id WHERE k.id = $1", [id])
    : c.query("SELECT first_name || ' ' || last_name AS name, email, token, guide_email FROM tour_requests WHERE id = $1", [id]))).rows[0];
  if (!r) throw new Error("No such booking or request.");
  return r as { name: string; email: string; token: string; guide_email: string };
}
export async function thread(kind: string, id: number): Promise<Msg[]> {
  if (!KINDS.includes(kind)) throw new Error("bad kind");
  return (await (await conn()).query("SELECT id, author_kind AS kind, author, body, created_at FROM tour_messages WHERE kind = $1 AND ref_id = $2 ORDER BY id", [kind, id])).rows;
}

/** Staff add an internal note (visitor never sees it) or email the visitor, who can answer from a link. */
export async function postStaff(kind: string, id: number, body: string, internal: boolean, author: string, base: string) {
  body = body.trim().slice(0, 4000);
  if (!KINDS.includes(kind) || !body) throw new Error("Write a message first.");
  const p = await party(kind as Kind, id);
  if (!internal) {
    const cfg = await getMailCfg();
    if (!mailReady(cfg)) throw new Error("Email isn't set up yet, so the message can't be sent. You can still save it as an internal note.");
    await send({ to: p.email, subject: "A message about your Kzoo Makers tour",
      text: `${author} from Kzoo Makers wrote:\n\n${body}\n\nReply here: ${base}/tours/thread?token=${p.token}`,
      html: `<p>${esc(author)} from Kzoo Makers wrote:</p><blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #f9b234;white-space:pre-wrap">${esc(body)}</blockquote><p><a href="${esc(`${base}/tours/thread?token=${p.token}`)}">Click here to reply</a></p>` }, cfg);
  }
  await (await conn()).query("INSERT INTO tour_messages (kind, ref_id, author_kind, author, body) VALUES ($1,$2,$3,$4,$5)", [kind, id, internal ? "note" : "staff", author.slice(0, 100), body]);
}

/** The visitor's side of the conversation, found by the token in their emails. */
async function byToken(token: string) {
  const c = await conn();
  const k = (await c.query("SELECT k.id, k.name, k.start_time, b.date, k.cancelled FROM tour_bookings k JOIN tour_blocks b ON b.id = k.block_id WHERE k.token = $1", [token])).rows[0];
  if (k) return { kind: "booking" as const, id: k.id as number, name: k.name as string, title: `Your tour on ${when(k.date, k.start_time)}${k.cancelled ? " (cancelled)" : ""}` };
  const r = (await c.query("SELECT id, first_name || ' ' || last_name AS name FROM tour_requests WHERE token = $1", [token])).rows[0];
  if (!r) throw new Error("This link isn't valid.");
  return { kind: "request" as const, id: r.id as number, name: r.name as string, title: "Your tour request" };
}
export async function visitorThread(token: string) {
  const t = await byToken(token);
  return { title: t.title, name: t.name, messages: (await thread(t.kind, t.id)).filter((m) => m.kind !== "note") };
}
export async function postVisitor(token: string, body: string, base: string) {
  body = body.trim().slice(0, 2000);
  if (!body) throw new Error("Write a message first.");
  const t = await byToken(token), c = await conn();
  if ((await c.query("SELECT count(*)::int AS n FROM tour_messages WHERE kind = $1 AND ref_id = $2 AND author_kind = 'visitor' AND created_at > now() - interval '1 hour'", [t.kind, t.id])).rows[0].n >= 10) throw new Error("That's a lot of messages. Please wait a bit before sending more.");
  await c.query("INSERT INTO tour_messages (kind, ref_id, author_kind, author, body) VALUES ($1,$2,'visitor',$3,$4)", [t.kind, t.id, t.name.slice(0, 100), body]);
  const p = await party(t.kind, t.id), page = `${base}/admin/tours${t.kind === "request" ? "/walkups" : ""}`;
  await mail(p.guide_email, `${t.name} replied about their tour`, [`${t.name} wrote:`, body], ["Open the conversation", page]);
  await notify(TOURS_TOPIC, { title: `Reply from ${t.name}`, message: body.slice(0, 300), tags: "speech_balloon", click: page });
}
