import { conn, withTx } from "./db";
import { processImage } from "./image";
import { logAudit } from "./store";
import { notifyUser } from "./notifications";
import { getMailCfg, mailReady, sendQueued as send } from "./mail";
import { checkId } from "./onboarding";
import { open, seal } from "./vault";

// The member's ID card page (/members/id) and ID renewals. A replacement ID waits for staff to compare it with the one on file (state pending),
// staff may ask a question (waiting) or decline (rejected); approving swaps it into member_ids. The thread lives in id_events.
export const RENEW_STATES = ["pending", "waiting", "approved", "rejected"] as const;
export type RenewState = (typeof RENEW_STATES)[number];
export type RenewEvent = { id: number; actor: string; by_member: boolean; kind: "message" | "note" | "state"; body: string; at: string };
export const SOON_DAYS = 30;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const GONE = "\\x"; // an empty bytea: decided renewals keep their thread but not a second copy of the ID
const event = (c: { query: (q: string, p: unknown[]) => Promise<unknown> }, id: number, actor: string, byMember: boolean, kind: string, body: string) =>
  c.query("INSERT INTO id_events (renewal_id, actor, by_member, kind, body) VALUES ($1,$2,$3,$4,$5)", [id, actor, byMember, kind, body]);

/** Whole days from today until an expiry date (negative once expired). `now` is injectable for the test. */
export const daysLeft = (expires: string | Date, now = Date.now()) => Math.ceil((+new Date(String(expires).slice(0, 10) + "T23:59:59") - now) / 864e5);
export const expiryLine = (days: number) => (days < 0 ? "Your ID has expired." : days === 0 ? "Your ID expires today." : `Your ID expires in ${days} day${days === 1 ? "" : "s"}.`);

async function mail(userId: number, base: string, subject: string, text: string) {
  try {
    const cfg = await getMailCfg(), u = (await (await conn()).query("SELECT email, name FROM site_users WHERE id = $1 AND disabled_at IS NULL", [userId])).rows[0];
    if (!u || !mailReady(cfg)) return;
    await send({ to: u.email, subject, text: `Hi ${u.name},\n\n${text}\n\n${base}/members/id` }, cfg);
  } catch { /* the in-site notification already went */ }
}
const tell = async (userId: number, base: string, title: string, body: string) => {
  await notifyUser(userId, { kind: "id", title, body, url: "/members/id" }).catch(() => {});
  await mail(userId, base, title, body);
};

// ---- member side
export type Card = { kind: string; expires_on: string | null; days: number | null; uploaded_at: string; renewal: { id: number; state: RenewState; events: RenewEvent[] } | null } | null;

export async function myCard(userId: number): Promise<Card> {
  const c = await conn(), i = (await c.query("SELECT kind, to_char(expires_on, 'YYYY-MM-DD') AS expires_on, uploaded_at FROM member_ids WHERE user_id = $1", [userId])).rows[0];
  if (!i) return null;
  const r = (await c.query("SELECT id, state FROM id_renewals WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [userId])).rows[0];
  const events = r ? (await c.query("SELECT id, actor, by_member, kind, body, at FROM id_events WHERE renewal_id = $1 AND kind <> 'note' ORDER BY id", [r.id])).rows : [];
  return { ...i, days: i.expires_on ? daysLeft(i.expires_on) : null, renewal: r ? { id: r.id, state: r.state, events } : null };
}

/** The member's own ID picture (decrypted); the caller must have checked the unlock. */
export async function myImage(userId: number) {
  const r = (await (await conn()).query("SELECT data FROM member_ids WHERE user_id = $1", [userId])).rows[0];
  return r ? open(r.data) : null;
}

async function tellStaff(title: string, id: number) {
  const staff = (await (await conn()).query("SELECT DISTINCT user_id FROM user_perms WHERE section IN ('crm', 'crm:id-renewals') OR (section = 'admin' AND level = 'write')")).rows;
  await Promise.all(staff.map((a) => notifyUser(a.user_id, { kind: "id-renewal", title, url: `/admin/crm/id-renewals?r=${id}` }).catch(() => {})));
}

/** A replacement ID from the member: goes to review, replacing any earlier upload still waiting. The ID on file stays in use meanwhile. */
export async function submitRenewal(u: { id: number; name: string }, kind: string, expires: string, file: File) {
  if (!(await (await conn()).query("SELECT 1 FROM member_ids WHERE user_id = $1", [u.id])).rowCount) throw new Error("Finish signing up first.");
  checkId(kind, expires);
  const img = (await processImage(file, { still: true, fit: { width: 2200, height: 2200 } })).data; // re-encoded: drops metadata, proves it is an image
  const id = await withTx(async (c) => {
    const r = (await c.query("UPDATE id_renewals SET kind = $2, expires_on = $3, data = $4, state = 'pending', created_at = now() WHERE user_id = $1 AND state IN ('pending','waiting') RETURNING id", [u.id, kind, expires || null, seal(img)])).rows[0]
      ?? (await c.query("INSERT INTO id_renewals (user_id, kind, expires_on, data) VALUES ($1,$2,$3,$4) RETURNING id", [u.id, kind, expires || null, seal(img)])).rows[0];
    await event(c, r.id, u.name, true, "message", "Uploaded a new ID for review.");
    return r.id as number;
  });
  await tellStaff(`${u.name} sent a new ID to review`, id);
}

export async function memberReply(u: { id: number; name: string }, bodyIn: string) {
  const body = clip(bodyIn, 2000);
  if (!body) throw new Error("Write a message first.");
  const c = await conn(), r = (await c.query("UPDATE id_renewals SET state = 'pending' WHERE user_id = $1 AND state IN ('pending','waiting') RETURNING id", [u.id])).rows[0];
  if (!r) throw new Error("There's nothing waiting for review.");
  await event(c, r.id, u.name, true, "message", body);
  await tellStaff(`${u.name} replied about their ID`, r.id);
}

// ---- reminders
/** Members whose ID is within SOON_DAYS of expiring (or past it), nudged at most weekly, skipping anyone with a renewal already in review and anyone who isn't an active member. */
export async function sendReminders(base: string) {
  const c = await conn();
  const due = (await c.query(`SELECT i.user_id, to_char(i.expires_on, 'YYYY-MM-DD') AS expires_on FROM member_ids i JOIN site_users u ON u.id = i.user_id
    WHERE u.approval = 'approved' AND u.disabled_at IS NULL AND u.member_listed_at IS NOT NULL AND i.expires_on IS NOT NULL AND i.expires_on <= current_date + $1::int
    AND (i.reminded_at IS NULL OR i.reminded_at < now() - interval '7 days') AND NOT EXISTS (SELECT 1 FROM id_renewals r WHERE r.user_id = i.user_id AND r.state IN ('pending','waiting')) LIMIT 50`, [SOON_DAYS])).rows;
  for (const d of due) {
    await c.query("UPDATE member_ids SET reminded_at = now() WHERE user_id = $1", [d.user_id]); // first, so a mail failure can't make it repeat every run
    await tell(d.user_id, base, "Time to update your ID", `${expiryLine(daysLeft(d.expires_on))} Please upload a current one so we can keep your membership in good standing.`);
  }
  return due.length;
}

// ---- staff side
export type Row = { id: number; user_id: number; name: string; email: string; state: RenewState; kind: string; expires_on: string | null; created_at: string; last_at: string; last_by_member: boolean };

export async function list(state: string): Promise<Row[]> {
  const s = (RENEW_STATES as readonly string[]).includes(state) ? state : "pending";
  return (await (await conn()).query(`SELECT r.id, r.user_id, u.name, u.email, r.state, r.kind, to_char(r.expires_on, 'YYYY-MM-DD') AS expires_on, r.created_at, l.at AS last_at, l.by_member AS last_by_member
    FROM id_renewals r JOIN site_users u ON u.id = r.user_id LEFT JOIN LATERAL (SELECT at, by_member FROM id_events WHERE renewal_id = r.id AND kind <> 'note' ORDER BY id DESC LIMIT 1) l ON true
    WHERE r.state = $1 ORDER BY r.created_at ${s === "pending" || s === "waiting" ? "ASC" : "DESC"} LIMIT 100`, [s])).rows;
}
export async function counts() {
  const out: Record<RenewState, number> = { pending: 0, waiting: 0, approved: 0, rejected: 0 };
  for (const r of (await (await conn()).query("SELECT state, count(*)::int n FROM id_renewals GROUP BY state")).rows) out[r.state as RenewState] = r.n;
  return out;
}
export type Detail = Row & { current: { kind: string; expires_on: string | null } | null; events: RenewEvent[] };
export async function detail(id: number): Promise<Detail> {
  const c = await conn();
  const row = (await c.query(`SELECT r.id, r.user_id, u.name, u.email, r.state, r.kind, to_char(r.expires_on, 'YYYY-MM-DD') AS expires_on, r.created_at, r.created_at AS last_at, false AS last_by_member FROM id_renewals r JOIN site_users u ON u.id = r.user_id WHERE r.id = $1`, [id])).rows[0];
  if (!row) throw new Error("No such renewal.");
  const [cur, events] = await Promise.all([c.query("SELECT kind, to_char(expires_on, 'YYYY-MM-DD') AS expires_on FROM member_ids WHERE user_id = $1", [row.user_id]), c.query("SELECT id, actor, by_member, kind, body, at FROM id_events WHERE renewal_id = $1 ORDER BY id", [id])]);
  return { ...row, current: cur.rows[0] ?? null, events: events.rows };
}

/** One picture for staff: `new` (the upload under review) or `old` (the ID on file). Always recorded in the audit log. */
export async function viewSide(id: number, side: string, who: string) {
  const c = await conn(), r = (await c.query(side === "old" ? "SELECT i.data, u.email FROM id_renewals r JOIN member_ids i ON i.user_id = r.user_id JOIN site_users u ON u.id = r.user_id WHERE r.id = $1" : "SELECT r.data, u.email FROM id_renewals r JOIN site_users u ON u.id = r.user_id WHERE r.id = $1 AND length(r.data) > 0", [id])).rows[0];
  if (!r) return null;
  await logAudit(who, "crm.id.view", r.email);
  return open(r.data);
}

const stale = () => new Error("Someone else just changed this. Reload to see the latest.");

export async function say(id: number, who: string, bodyIn: string, wait: boolean, base: string) {
  const body = clip(bodyIn, 2000);
  if (!body) throw new Error("Write a message first.");
  const c = await conn(), r = (await c.query("SELECT user_id FROM id_renewals WHERE id = $1 AND state IN ('pending','waiting')", [id])).rows[0];
  if (!r) throw stale();
  if (wait) await c.query("UPDATE id_renewals SET state = 'waiting' WHERE id = $1", [id]);
  await event(c, id, who, false, "message", body);
  await tell(r.user_id, base, "A question about your ID", body);
}
export async function note(id: number, who: string, bodyIn: string) {
  const body = clip(bodyIn, 2000);
  if (!body) throw new Error("Write a note first.");
  await event(await conn(), id, who, false, "note", body);
}

/** Approve (the new ID replaces the one on file) or decline. Only an open renewal can be decided, once. */
export async function decide(id: number, to: string, who: string, reason: string, base: string) {
  if (to !== "approved" && to !== "rejected") throw new Error("Unknown decision.");
  const why = clip(reason, 1000);
  const r = await withTx(async (c) => {
    const x = (await c.query("UPDATE id_renewals SET state = $2, decided_at = now() WHERE id = $1 AND state IN ('pending','waiting') RETURNING user_id, kind, expires_on, data", [id, to])).rows[0];
    if (!x) throw stale();
    if (to === "approved") await c.query("UPDATE member_ids SET kind = $2, expires_on = $3, data = $4, uploaded_at = now(), reminded_at = NULL WHERE user_id = $1", [x.user_id, x.kind, x.expires_on, x.data]);
    await c.query("UPDATE id_renewals SET data = $2::bytea WHERE id = $1", [id, GONE]);
    await event(c, id, who, false, "state", to === "approved" ? "Approved" : `Declined${why ? ": " + why : ""}`);
    return x;
  });
  await logAudit(who, `crm.id.${to}`, String(r.user_id));
  await tell(r.user_id, base, to === "approved" ? "Your new ID was approved" : "Your new ID wasn't accepted", to === "approved" ? "Thanks, your ID on file is up to date." : `${why || "Please upload a clearer, current photo of your ID."} You can try again any time.`);
}
