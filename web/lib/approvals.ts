import type { Pool, PoolClient } from "pg";
import { conn, withTx } from "./db";
import { logAudit } from "./store";
import { notifyUser } from "./notifications";
import { addRegistered, getMailCfg, mailReady, sendQueued as send } from "./mail";
import { afterSignIn, loginLink } from "./readers";
import { deleteUser, updateProfile } from "./profiles";
import { pickClass } from "./membership";

// Sign-up approval. States: pending (needs staff), waiting (staff asked something, waiting for the applicant), rejected, approved.
// Staff may move between any two states; the thread (approval_events) records every message, note and move with who did it.
export const STATES = ["pending", "waiting", "rejected", "approved"] as const;
export type State = (typeof STATES)[number];
export type ApprovalEvent = { id: number; actor: string; by_applicant: boolean; kind: "message" | "note" | "state"; to_state: State | null; body: string; at: string };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const esc = (s: string) => s.replace(/[<>&"]/g, "");
const stale = () => new Error("Someone else just changed this person. Reload to see the latest.");

async function addEvent(c: Pool | PoolClient, userId: number, actor: string, byApplicant: boolean, kind: string, toState: State | null, body = "") {
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
  const staff = (await c.query("SELECT DISTINCT user_id FROM user_perms WHERE section IN ('crm', 'crm:approvals') OR (section = 'admin' AND level = 'write')")).rows;
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

export type Review = { confirmed?: boolean; reason?: string; level?: string; edit?: { first_name?: string; last_name?: string; phone?: string } };

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
  const reason = clip(r.reason, 500), cls = to === "approved" ? await pickClass(r.level) : null;
  // Flip first (a lost race changes nothing); if the corrected details are refused, put the state back.
  if (!(await c.query("UPDATE site_users SET approval = $3 WHERE id = $1 AND approval = $2", [id, from, to])).rowCount) throw stale();
  if (to === "approved") await c.query("UPDATE site_users SET onboarding = 'waiver' WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM sign_docs WHERE user_id = $1 AND kind = 'waiver' AND status = 'complete')", [id]);
  if (to === "approved" && r.edit) {
    try { await updateProfile(id, r.edit, ["first_name", "last_name", "phone"], who); }
    catch (e) { await c.query("UPDATE site_users SET approval = $2 WHERE id = $1 AND approval = $3", [id, from, to]); throw e; }
  }
  if (cls) await c.query("INSERT INTO memberships (user_id, level) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, cls]);
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

type TourKind = "request" | "booking";
const TOUR_TABLE = { request: "tour_requests", booking: "tour_bookings" } as const;
const kindOf = (k: unknown): TourKind => (k === "booking" ? "booking" : "request");

/** Staff activate someone on the spot (a walk-up or a booked tour who showed up ready to join): make or find their account, approve it and put them at the waiver step, then email the sign-in link. Idempotent for someone already approved.
 *  Remembers what their account was before (activated_prev) so Undo knows what to put back. The caller then closes the request or marks the booking signed up. */
export async function activateTourPerson(kindIn: unknown, id: number, who: string, base: string, level?: string) {
  const kind = kindOf(kindIn), t = TOUR_TABLE[kind], from = kind === "request" ? "a walk-up request" : "a tour booking";
  // One transaction, and the walk-up/booking row is locked first: a second click waits, then sees activated_at and is refused. Nothing is half-done if a step fails.
  const { userId, email, name } = await withTx(async (c) => {
    const r = (await c.query(`SELECT first_name, last_name, email, phone, status, activated_at${kind === "booking" ? ", cancelled" : ""} FROM ${t} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) throw new Error(kind === "request" ? "No such request." : "No such booking.");
    if (r.activated_at) throw new Error("This person was already activated. Undo that first if it was a mistake.");
    if (kind === "request" ? r.status !== "open" && r.status !== "offered" : r.cancelled) throw new Error(kind === "request" ? "This request is already scheduled or dismissed." : "This booking was cancelled.");
    const email = String(r.email).trim().toLowerCase(), name = `${r.first_name} ${r.last_name}`.trim();
    const old = (await c.query("SELECT id, approval, disabled_at FROM site_users WHERE email = $1", [email])).rows[0];
    if (old?.disabled_at) throw new Error("This person's account is disabled. Enable it in the CRM first.");
    if (old?.approval === "rejected") throw new Error("This person was turned down earlier. Change that in CRM > Approvals first.");
    const cls = old?.approval === "approved" ? null : await pickClass(level); // someone already approved keeps the class they have
    const userId: number = old?.id ?? (await c.query("INSERT INTO site_users (email, name, first_name, last_name, phone, approval, verified_at) VALUES ($1,$2,$3,$4,$5,'approved', now()) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id", [email, name, r.first_name, r.last_name, r.phone])).rows[0].id;
    const was = old?.approval ?? "new";
    await c.query("UPDATE site_users SET approval = 'approved', verified_at = COALESCE(verified_at, now()), phone = CASE WHEN phone = '' THEN $2 ELSE phone END WHERE id = $1", [userId, r.phone]);
    await c.query("UPDATE site_users SET onboarding = 'waiver' WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM sign_docs WHERE user_id = $1 AND kind = 'waiver' AND status = 'complete')", [userId]);
    if (cls) await c.query("INSERT INTO memberships (user_id, level) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, cls]);
    await c.query(`UPDATE ${t} SET activated_at = now(), activated_by = $2, activated_prev = $3 WHERE id = $1`, [id, who, was]);
    if (was !== "approved") await addEvent(c, userId, who, false, "state", "approved", `Activated on site from ${from}`);
    return { userId, email, name, was };
  }).then(async (x) => { await logAudit(who, "crm.approval", `${x.email}: ${x.was} → approved (activated from ${from})`); return x; });
  await addRegistered(email, name, base).catch(() => {});
  return { emailed: await mailTo({ id: userId, email, name }, "Welcome to Kzoo Makers: sign your agreement", "You're activated! Sign in to sign our liability waiver, read the membership handbook, upload a photo ID and finish setting up your profile.", "", "Get started", "/members", base) };
}

/** Where someone has got to since they were activated, and so what an undo would throw away. */
async function progress(c: Pool | PoolClient, userId: number) {
  const u = (await c.query("SELECT onboarding, EXISTS (SELECT 1 FROM sign_docs WHERE user_id = $1 AND kind = 'waiver' AND status = 'complete') AS waiver, EXISTS (SELECT 1 FROM member_ids WHERE user_id = $1) AS id FROM site_users WHERE id = $1", [userId])).rows[0];
  return { waiver: !!u.waiver, handbook: u.onboarding === "id" || u.onboarding === "done", id: !!u.id };
}

/** Undo an activation: the walk-up or booking goes back to where it was (the caller reopens it) and, unless they were already a member before, the account goes back too.
 *  Someone who has already signed the waiver, read the handbook or uploaded an ID is only reset after `confirm`, and only by staff on a kzoomakers.org address (`staff`): the signed waiver and ID are deleted. */
export async function undoActivation(kindIn: unknown, id: number, who: string, o: { confirm: boolean; staff: boolean; check?: boolean }) {
  const kind = kindOf(kindIn), t = TOUR_TABLE[kind];
  // One transaction with the walk-up/booking row locked, so a double click or a click during an activation can't undo twice or half-way.
  const out = await withTx(async (c) => {
    const r = (await c.query(`SELECT email, activated_at, activated_prev FROM ${t} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r?.activated_at) throw new Error("This person wasn't activated from here.");
    const u = r.activated_prev === "approved" ? null : (await c.query("SELECT id, email FROM site_users WHERE lower(email) = lower($1)", [r.email])).rows[0]; // already a member before: leave their account alone
    let removeUser: number | null = null;
    if (u) {
      if ((await c.query("SELECT 1 FROM user_perms WHERE user_id = $1", [u.id])).rowCount) throw new Error("This person has admin access, so their account can't be reset here.");
      const p = await progress(c, u.id), started = p.waiver || p.handbook || p.id;
      if (o.check) return { res: { needsConfirm: started, progress: p, done: false } };
      if (started && !o.confirm) return { res: { needsConfirm: true, progress: p, done: false } };
      if (started && !o.staff) throw new Error("Only staff signed in with a kzoomakers.org address can reset someone who has already signed the waiver or uploaded an ID.");
      await c.query("DELETE FROM sign_docs WHERE user_id = $1 AND kind = 'waiver'", [u.id]);
      await c.query("DELETE FROM member_ids WHERE user_id = $1", [u.id]);
      await c.query("DELETE FROM memberships WHERE user_id = $1", [u.id]);
      if (r.activated_prev === "new") removeUser = u.id;
      else if (r.activated_prev) {
        await c.query("UPDATE site_users SET approval = $2, onboarding = 'done' WHERE id = $1", [u.id, r.activated_prev]);
        await addEvent(c, u.id, who, false, "state", r.activated_prev, "Activation undone");
      }
    }
    if (o.check) return { res: { needsConfirm: false, progress: null, done: false } };
    await c.query(`UPDATE ${t} SET activated_at = NULL, activated_by = '', activated_prev = '' WHERE id = $1`, [id]);
    return { res: { needsConfirm: false, progress: null, done: true }, removeUser, email: r.email, reset: !!u };
  });
  if (!out.res.done) return out.res;
  if (out.removeUser) await deleteUser(out.removeUser, who); // its own transaction (it takes the admin lock), so it runs after this one commits
  await logAudit(who, "crm.approval", `${out.email}: activation undone${out.reset ? " (account reset)" : ""}`);
  return out.res;
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
