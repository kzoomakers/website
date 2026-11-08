import { randomBytes } from "crypto";
import { db } from "./db";
import { notify, TOURS_TOPIC } from "./ntfy";
import { getMailCfg, mailReady, send } from "./mail";

// Tour scheduling, ported from kzoomakers/schedulingapp (tours only). Guides publish availability blocks; slots are derived from
// block start/end/length instead of stored, and visitors book a slot. Skipped from the original: SMS, surveys, ban list, reCAPTCHA.
export const TZ = "America/Detroit"; // shortcut: fixed timezone, make it a setting if the space ever moves
export const MIN_ADVANCE_H = 4, WINDOW_DAYS = 28;
export const AREAS = ["Wood shop", "Metal shop", "Laser shop", "3D printing", "Craft room", "Electronics", "Meeting space"];
export const HEARD = ["Friend or member", "Web search", "Social media", "Event or class", "Flyer or poster", "Other"];
export const STATUSES = ["booked", "no_show", "signed_up", "sign_up_later", "maybe_later", "no_interest"] as const;

export type Block = { id: number; date: string; start_time: string; end_time: string; slot_minutes: number; max_per_slot: number; guide_name: string; guide_email: string; booked: number };
export type Booking = { id: number; block_id: number; date: string; start_time: string; name: string; email: string; phone: string; interest: string; heard: string; status: string; notes: string; created_at: string; guide_name: string };

const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
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
    await p.query("CREATE INDEX IF NOT EXISTS tour_bookings_block ON tour_bookings (block_id)");
    // The Google Form is retired: point the menu link and the redirect page at the new booking page.
    await p.query("UPDATE settings SET data = replace(data::text, $1, '/tours')::jsonb WHERE key = 'menu'", [GOOGLE_FORM]);
    await p.query("UPDATE pages SET data = replace(data::text, $1, '/tours')::jsonb WHERE slug = 'tour-form-redirect'", [GOOGLE_FORM]);
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}

const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
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
  return (await (await conn()).query(`${BLOCKS} WHERE ($1 OR b.date >= $2) ORDER BY b.date ${past ? "DESC" : ""}, b.start_time`, [past, localNow().slice(0, 10)])).rows;
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

export const deleteBlock = async (id: number) => void (await (await conn()).query("DELETE FROM tour_blocks WHERE id = $1", [id]));

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
    CASE WHEN k.cancelled THEN 'cancelled' ELSE k.status END AS status, k.notes, k.created_at, b.guide_name
    FROM tour_bookings k JOIN tour_blocks b ON b.id = k.block_id WHERE ($1 OR b.date >= $2) ORDER BY b.date ${past ? "DESC" : ""}, k.start_time, k.id`, [past, localNow().slice(0, 10)])).rows;
}

export async function setStatus(id: number, status: string) {
  if (!(STATUSES as readonly string[]).includes(status)) throw new Error("bad status");
  if (!(await (await conn()).query("UPDATE tour_bookings SET status = $2 WHERE id = $1 AND NOT cancelled", [id, status])).rowCount) throw new Error("That booking is cancelled or gone.");
}
export const setNotes = async (id: number, notes: string) => void (await (await conn()).query("UPDATE tour_bookings SET notes = $2 WHERE id = $1", [id, notes.slice(0, 2000)]));

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
export async function book(x: { block: number; start: string; name: string; email: string; phone: string; areas: string[]; heard: string }, ipHash: string, base: string) {
  const name = x.name.trim().slice(0, 100), email = x.email.trim().toLowerCase().slice(0, 200), phone = x.phone.trim().slice(0, 30);
  if (!name || !EMAIL_OK.test(email)) throw new Error("Please enter your name and a valid email address.");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("Please enter a phone number with 10 digits.");
  const interest = x.areas.filter((a) => AREAS.includes(a)).join(", "), heard = HEARD.includes(x.heard) ? x.heard : "";
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
    await client.query("INSERT INTO tour_bookings (block_id, start_time, name, email, phone, interest, heard, token, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [b.id, x.start, name, email, phone, interest, heard, token, ipHash]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  const w = when(b.date, x.start);
  await mail(email, "Your Kzoo Makers tour", [`Hi ${name}, you're booked for a tour on ${w}.`, "If your plans change, please cancel so someone else can have the spot."], ["Cancel this tour", `${base}/tours/cancel?token=${token}`]);
  await mail(b.guide_email, `New tour booking: ${name}`, [`${name} (${email}, ${phone}) booked a tour on ${w}.`, interest && `Interested in: ${interest}`].filter(Boolean) as string[]);
  await notify(TOURS_TOPIC, { title: `Tour booked: ${name}`, message: `${w}\n${name} · ${email} · ${phone}${interest ? `\nInterested in: ${interest}` : ""}`, tags: "calendar", click: `${base}/admin/tours` });
  return { date: b.date, start: x.start };
}

export async function cancelByToken(token: string, confirm: boolean) {
  const c = await conn();
  const r = (await c.query(`SELECT k.id, k.name, k.cancelled, k.start_time, b.date, b.guide_email FROM tour_bookings k JOIN tour_blocks b ON b.id = k.block_id WHERE k.token = $1`, [token])).rows[0];
  if (!r) throw new Error("This cancel link isn't valid.");
  if (confirm && !r.cancelled) {
    await c.query("UPDATE tour_bookings SET cancelled = true WHERE id = $1", [r.id]);
    await mail(r.guide_email, `Tour cancelled: ${r.name}`, [`${r.name} cancelled their tour on ${when(r.date, r.start_time)}.`]);
    await notify(TOURS_TOPIC, { title: `Tour cancelled: ${r.name}`, message: when(r.date, r.start_time), tags: "x", priority: 2 });
  }
  return { when: when(r.date, r.start_time), cancelled: confirm || r.cancelled };
}

export async function cancelBooking(id: number) {
  const c = await conn();
  const r = (await c.query("UPDATE tour_bookings SET cancelled = true WHERE id = $1 AND NOT cancelled RETURNING name, email, start_time, block_id", [id])).rows[0];
  if (!r) throw new Error("Already cancelled.");
  const b = (await c.query("SELECT date FROM tour_blocks WHERE id = $1", [r.block_id])).rows[0];
  await mail(r.email, "Your Kzoo Makers tour was cancelled", [`Hi ${r.name}, your tour on ${when(b.date, r.start_time)} has been cancelled. Sorry for the trouble. You're welcome to book another time at kzoomakers.org/tours.`]);
}
