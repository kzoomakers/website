import { db } from "./db";
import { logAudit } from "./store";
import { notifyUser } from "./notifications";
import { addRegistered, getMailCfg, mailReady, send } from "./mail";
import { afterSignIn, loginLink } from "./readers";
import { updateProfile } from "./profiles";

// Sign-up approval. States: pending (needs staff), waiting (staff asked something, waiting for the applicant), rejected, approved.
// Staff may move between any two states; the thread (approval_events) records every message, note and move with who did it.
export const STATES = ["pending", "waiting", "rejected", "approved"] as const;
export type State = (typeof STATES)[number];
export type ApprovalEvent = { id: number; actor: string; by_applicant: boolean; kind: "message" | "note" | "state"; to_state: State | null; body: string; at: string };

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const esc = (s: string) => s.replace(/[<>&"]/g, "");
const stale = () => new Error("Someone else just changed this person. Reload to see the latest.");

async function addEvent(c: Awaited<ReturnType<typeof conn>>, userId: number, actor: string, byApplicant: boolean, kind: string, toState: State | null, body = "") {
  await c.query("INSERT INTO approval_events (user_id, actor, by_applicant, kind, to_state, body) VALUES ($1,$2,$3,$4,$5,$6)", [userId, actor, byApplicant, kind, toState, body]);
}

/** Compare-and-set, so two staff acting on the same person at once can't both win. */
async function setState(c: Awaited<ReturnType<typeof conn>>, id: number, from: State, to: State, actor: string, byApplicant: boolean, body = "") {
  if (!(await c.query("UPDATE site_users SET approval = $3 WHERE id = $1 AND approval = $2", [id, from, to])).rowCount) throw stale();
  await addEvent(c, id, actor, byApplicant, "state", to, body);
}

/** Everyone who can work the queue: CRM access or full admin. */
async function tellStaff(title: string, id: number) {
  const c = await conn();
  const staff = (await c.query("SELECT DISTINCT user_id FROM user_perms WHERE section = 'crm' OR (section = 'admin' AND level = 'write')")).rows;
  await Promise.all(staff.map((a) => notifyUser(a.user_id, { kind: "approval", title, url: `/admin/crm/approvals?u=${id}` }).catch(() => {})));
}

/** A new account just verified its email: it enters the queue and staff are told. */
export async function applied(userId: number) {
  const c = await conn(), u = (await c.query("SELECT name FROM site_users WHERE id = $1", [userId])).rows[0];
  if (!u) return;
  await addEvent(c, userId, u.name, true, "state", "pending", "Applied for membership");
  await tellStaff(`${u.name} is waiting for approval`, userId);
}

/** Emails the applicant a one-click link (good for a week) to `next`. Returns false instead of throwing when email isn't set up or fails, so the action itself still counts. */
async function mailTo(u: { id: number; email: string; name: string }, subject: string, intro: string, quote: string, button: string, next: string, base: string) {
  try {
    const cfg = await getMailCfg();
    if (!mailReady(cfg)) return false;
    const link = await loginLink(u.id, next, base, 7), n = esc(u.name), q = esc(quote);
    await send({ to: u.email, subject,
      text: `Hi ${u.name},\n\n${intro}\n\n${quote ? `${quote}\n\n` : ""}${button}: ${link}\n\n(The link signs you in, works once, and lasts a week.)`,
      html: `<p>Hi ${n},</p><p>${esc(intro)}</p>${q ? `<blockquote style="margin:0 0 16px;padding:8px 14px;border-left:3px solid #ccc;white-space:pre-wrap">${q}</blockquote>` : ""}<p><a href="${link}">${esc(button)}</a><br><small>The link signs you in, works once, and lasts a week.</small></p>` }, cfg);
    return true;
  } catch { return false; }
}

export type Row = { id: number; name: string; email: string; phone: string; applied_at: string; last_at: string; last_by_applicant: boolean };

/** Applicants in one state. Open states list longest-waiting first; closed ones newest first. */
export async function listApplicants(state: string): Promise<Row[]> {
  const s = (STATES as readonly string[]).includes(state) ? state : "pending", open = s === "pending" || s === "waiting";
  return (await (await conn()).query(
    `SELECT u.id, u.name, u.email, u.phone, f.applied_at, l.at AS last_at, l.by_applicant AS last_by_applicant
     FROM site_users u
     JOIN LATERAL (SELECT COALESCE(min(at), u.created_at) AS applied_at, count(*) AS n FROM approval_events WHERE user_id = u.id) f ON ($1 <> 'approved' OR f.n > 0)
     LEFT JOIN LATERAL (SELECT at, by_applicant FROM approval_events WHERE user_id = u.id AND kind <> 'note' ORDER BY id DESC LIMIT 1) l ON true
     WHERE u.verified_at IS NOT NULL AND u.approval = $1 ORDER BY COALESCE(l.at, f.applied_at) ${open ? "ASC" : "DESC"} LIMIT 100`, [s])).rows.map((r) => ({ ...r, last_at: r.last_at ?? r.applied_at }));
}

export async function counts(): Promise<Record<State, number>> {
  const out = { pending: 0, waiting: 0, rejected: 0, approved: 0 };
  for (const r of (await (await conn()).query("SELECT approval, count(*)::int n FROM site_users u WHERE verified_at IS NOT NULL AND (approval <> 'approved' OR EXISTS (SELECT 1 FROM approval_events WHERE user_id = u.id)) GROUP BY approval")).rows) out[r.approval as State] = r.n;
  return out;
}

export type Detail = { id: number; name: string; first_name: string; last_name: string; email: string; phone: string; address: string; approval: State; events: ApprovalEvent[]; waiver_id: number | null; has_id: boolean; onboarding: string };

/** One applicant with their thread. The applicant's own view (forApplicant) leaves out staff notes. */
export async function detail(id: number, forApplicant = false): Promise<Detail | null> {
  const c = await conn();
  const u = (await c.query(`SELECT id, name, first_name, last_name, email, phone, approval,
    onboarding, (SELECT id FROM sign_docs WHERE user_id = site_users.id AND kind = 'waiver' AND status = 'complete' ORDER BY id DESC LIMIT 1) AS waiver_id, EXISTS (SELECT 1 FROM member_ids WHERE user_id = site_users.id) AS has_id,
    btrim(concat_ws(', ', NULLIF(address1, ''), NULLIF(address2, ''), NULLIF(city, ''), NULLIF(concat_ws(' ', NULLIF(state, ''), NULLIF(zip, '')), ''))) AS address
    FROM site_users WHERE id = $1 AND verified_at IS NOT NULL`, [id])).rows[0];
  if (!u) return null;
  u.events = (await c.query(`SELECT id, actor, by_applicant, kind, to_state, body, at FROM approval_events WHERE user_id = $1 ${forApplicant ? "AND kind <> 'note'" : ""} ORDER BY id`, [id])).rows;
  return u;
}

/** Staff writes to the applicant. With `wait` it also moves them to Waiting (until they reply). Emails them a link to the thread. */
export async function say(id: number, who: string, bodyIn: string, wait: boolean, base: string) {
  const body = clip(bodyIn, 2000), c = await conn();
  if (!body) throw new Error("Write a message first.");
  const u = (await c.query("SELECT id, email, name, approval FROM site_users WHERE id = $1 AND verified_at IS NOT NULL", [id])).rows[0];
  if (!u) throw new Error("No such applicant.");
  if (u.approval === "approved") throw new Error("They're already approved. Message them from their CRM page.");
  if (wait && u.approval !== "waiting") await setState(c, id, u.approval, "waiting", who, false); // first, so a lost race leaves no stray message
  await addEvent(c, id, who, false, "message", null, body);
  return { emailed: await mailTo(u, "A question about your Kzoo Makers membership", "The Kzoo Makers team has a message for you about your new account:", body, "Read and reply", "/members", base) };
}

/** Staff-only note (the applicant never sees it). */
export async function note(id: number, who: string, bodyIn: string) {
  const body = clip(bodyIn, 2000), c = await conn();
  if (!body) throw new Error("Write a note first.");
  if (!(await c.query("SELECT 1 FROM site_users WHERE id = $1 AND verified_at IS NOT NULL", [id])).rowCount) throw new Error("No such applicant.");
  await addEvent(c, id, who, false, "note", null, body);
}

export type Review = { confirmed?: boolean; reason?: string; edit?: { first_name?: string; last_name?: string; phone?: string } };

/** Moves an applicant from `from` (what the staff member was looking at) to `to`. Approving needs the details confirmed and may correct name and phone. */
export async function move(id: number, from: string, to: string, who: string, r: Review, base: string) {
  const ok = (x: string): x is State => (STATES as readonly string[]).includes(x);
  if (!ok(from) || !ok(to) || from === to) throw new Error("Choose a different state.");
  const c = await conn(), u = (await c.query("SELECT id, email, name, first_name, approval FROM site_users WHERE id = $1 AND verified_at IS NOT NULL", [id])).rows[0];
  if (!u) throw new Error("No such applicant.");
  if (u.approval !== from) throw stale();
  if (to !== "approved" && (await c.query("SELECT 1 FROM user_perms WHERE user_id = $1", [id])).rowCount) throw new Error("This person has admin access, so they can't be moved out of Approved.");
  if (to === "approved") {
    if (!r.confirmed) throw new Error("Confirm you've checked their name and contact details first.");
    if (!r.edit && !u.first_name) throw new Error("They need a name before they can be approved.");
  }
  const reason = clip(r.reason, 500);
  // Flip first (a lost race changes nothing); if the corrected details are refused, put the state back.
  if (!(await c.query("UPDATE site_users SET approval = $3 WHERE id = $1 AND approval = $2", [id, from, to])).rowCount) throw stale();
  if (to === "approved") await c.query("UPDATE site_users SET onboarding = 'waiver' WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM sign_docs WHERE user_id = $1 AND kind = 'waiver' AND status = 'complete')", [id]);
  if (to === "approved" && r.edit) {
    try { await updateProfile(id, r.edit, ["first_name", "last_name", "phone"], who); }
    catch (e) { await c.query("UPDATE site_users SET approval = $2 WHERE id = $1 AND approval = $3", [id, from, to]); throw e; }
  }
  await addEvent(c, id, who, false, "state", to, to === "approved" ? "Name and contact details checked" : to === "rejected" ? reason : "");
  await logAudit(who, "crm.approval", `${u.email}: ${from} → ${to}${reason ? ` (${reason})` : ""}`);
  const fresh = (await c.query("SELECT id, email, name FROM site_users WHERE id = $1", [id])).rows[0];
  if (to === "approved") {
    await addRegistered(fresh.email, fresh.name, base).catch(() => {});
    return { emailed: await mailTo(fresh, "Welcome to Kzoo Makers: you're approved", "Good news: your Kzoo Makers account has been approved. When you sign in you'll sign our liability waiver, read the membership handbook and upload a photo ID, then finish setting up your profile.", "", "Get started", await afterSignIn(id, "/members"), base) };
  }
  if (to === "rejected") return { emailed: await mailTo(fresh, "Your Kzoo Makers application", "We're sorry, but we couldn't approve your Kzoo Makers account.", reason, "See details", "/members", base) };
  return { emailed: false };
}

/** The applicant answers. Waiting becomes Pending again, which puts them back at the top of the queue. */
export async function reply(id: number, bodyIn: string) {
  const body = clip(bodyIn, 2000), c = await conn();
  if (!body) throw new Error("Write a message first.");
  const u = (await c.query("SELECT name, approval FROM site_users WHERE id = $1 AND verified_at IS NOT NULL", [id])).rows[0];
  if (!u || (u.approval !== "pending" && u.approval !== "waiting")) throw new Error("This application is closed.");
  if ((await c.query("SELECT count(*)::int n FROM approval_events WHERE user_id = $1 AND by_applicant AND kind = 'message' AND at > now() - interval '1 hour'", [id])).rows[0].n >= 10) throw new Error("That's a lot of messages. Please wait a while for us to answer.");
  if (u.approval === "waiting") await setState(c, id, "waiting", "pending", u.name, true);
  await addEvent(c, id, u.name, true, "message", null, body);
  await tellStaff(`${u.name} replied`, id);
}

/** For the admin alert pop-up: how many people need staff (pending), and the newest thread activity among them. */
export async function alertSummary() {
  return (await (await conn()).query(`SELECT count(*)::int AS applicants, COALESCE(max(GREATEST(u.id, (SELECT COALESCE(max(id), 0) FROM approval_events WHERE user_id = u.id AND kind <> 'note'))), 0)::int AS "applicantMax"
    FROM site_users u WHERE verified_at IS NOT NULL AND approval = 'pending'`)).rows[0] as { applicants: number; applicantMax: number };
}
