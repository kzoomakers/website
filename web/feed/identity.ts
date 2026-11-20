import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { isAdmin } from "@/auth";
import { conn } from "@/lib/db";
import { hit } from "@/lib/limit";
import { getMailCfg, mailReady, sendQueued } from "@/lib/mail";
import { clientIp } from "@/lib/comments";
import { STEP_SQL } from "@/lib/waiver";
import { getFeedConfig, feedOrigin } from "./config";
import { tattle } from "./models/mod-notes";
import {
  DUMMY_DIGEST, EMAIL_OK, SESSION_COOKIE, checkPassword, csrfFor, hashPassword, passwordProblem, readSession, sessionValue, usernameProblem, type Handoff,
} from "./auth";

// The community site's accounts. Three kinds: admin and member arrive through the main site's login handoff and never have a password here;
// external accounts register with email and password. Nothing in this file ever writes to site_users.

/** A message for the person, never built from anything they typed (pages only show messages from this fixed list, chosen by code). */
export class Refused extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export type Viewer = { id: number; username: string | null; kind: "admin" | "member" | "external"; email: string; isAdmin: boolean; isModerator: boolean; verified: boolean; csrf: string; prefs: { scheme: string; contrast: string } };

// ---- Sessions
/** Fresh cookie value for a user (their current session_version). */
export async function startSession(userId: number) {
  const ver = (await (await conn()).query("SELECT session_version v FROM feed.users WHERE id = $1", [userId])).rows[0].v;
  return sessionValue(userId, ver);
}

/** The signed-in person for a cookie value, or null. Every request re-checks the database: bans, password changes and lost admin or member standing end a session at once. */
export async function viewerFor(cookie?: string): Promise<Viewer | null> {
  const s = readSession(cookie);
  if (!s) return null;
  const c = await conn();
  const u = (await c.query(
    `SELECT u.id, u.username, u.kind, u.email, u.is_admin, u.is_moderator, u.email_verified_at, u.site_user_id, u.settings->>'prefers_color_scheme' AS scheme, u.settings->>'prefers_contrast' AS contrast FROM feed.users u
     WHERE u.id = $1 AND u.session_version = $2 AND u.banned_at IS NULL AND u.deleted_at IS NULL`, [s.id, s.ver])).rows[0];
  if (!u) return null;
  // Standing on the main site is re-derived every time: losing it ends the session, and an admin who left the allow-list is no longer one.
  if (u.kind === "admin" && !isAdmin(u.email)) { await c.query("UPDATE feed.users SET is_admin = false, is_moderator = false, session_version = session_version + 1 WHERE id = $1", [u.id]); return null; }
  if (u.kind === "member" && !(await memberStanding(u.site_user_id, u.email))) return null;
  return { id: u.id, username: u.username, kind: u.kind, email: u.email, isAdmin: u.is_admin, isModerator: u.is_moderator, verified: !!u.email_verified_at, csrf: csrfFor(cookie!), prefs: { scheme: u.scheme ?? "system", contrast: u.contrast ?? "system" } };
}

/** The signed-in person for this request (looked up once per request). */
export const currentFeedUser = cache(async () => viewerFor((await cookies()).get(SESSION_COOKIE)?.value));

/** Is this still an approved, enabled member of the club? (Same rule as currentMember on the main site.) */
async function memberStanding(siteUserId: number | null, email: string) {
  if (!siteUserId) return false;
  return !!(await (await conn()).query(
    `SELECT 1 FROM site_users u WHERE u.id = $1 AND lower(u.email) = lower($2) AND u.verified_at IS NOT NULL AND u.disabled_at IS NULL AND u.approval = 'approved' AND ${STEP_SQL} = 'done'`, [siteUserId, email])).rowCount;
}

// ---- Handoff (admin and member)
/** Burns a token id; false if it was already used. Old ids are swept out as new ones arrive. */
export async function consumeHandoff(jti: string, expSecs: number) {
  const c = await conn();
  await c.query("DELETE FROM feed.handoff_used WHERE expires_at < now()");
  return (await c.query("INSERT INTO feed.handoff_used (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT DO NOTHING", [jti, expSecs + 60])).rowCount === 1;
}

/** Creates or updates the feed account for a verified handoff and returns a session cookie value. The role in the token is only a request: it is re-derived here from the allow-list or the member record. */
export async function loginFromHandoff(h: Handoff): Promise<string> {
  const email = h.email.toLowerCase();
  let kind: "admin" | "member";
  if (h.role === "admin") { if (!isAdmin(email)) throw new Refused("not_allowed"); kind = "admin"; }
  else {
    const m = h.uid && (await (await conn()).query("SELECT lower(email) e FROM site_users WHERE id = $1", [h.uid])).rows[0];
    if (!m || m.e !== email || !(await memberStanding(h.uid, email))) throw new Refused("not_allowed");
    if (!(await getFeedConfig()).membersAutoCreate && !(await (await conn()).query("SELECT 1 FROM feed.users WHERE site_user_id = $1", [h.uid])).rowCount) throw new Refused("not_allowed");
    kind = "member";
  }
  const c = await conn(), staff = kind === "admin";
  const own = (await c.query("SELECT id, kind, banned_at, deleted_at FROM feed.users WHERE lower(email) = $1 FOR UPDATE", [email])).rows[0];
  if (own?.banned_at || own?.deleted_at) { await tattle(own.id, own.banned_at ? "Attempted to log in while banned." : "Attempted to log in after deleting their account."); throw new Refused("banned"); }
  let id: number;
  if (!own) {
    id = (await c.query("INSERT INTO feed.users (email, token, kind, site_user_id, email_verified_at, is_admin, is_moderator, created_at) VALUES ($1,$2,$3,$4, now(), $5, $5, now()) RETURNING id",
      [email, token(), kind, kind === "member" ? h.uid : null, staff])).rows[0].id;
  } else {
    id = own.id;
    // One person, one account, and it only ever moves up (external < member < admin). A password set before this person's first handoff (anyone could have registered their address) is thrown away with every session and reset link, so it can't be used to enter the account.
    const up = own.kind === "external" || (own.kind === "member" && staff);
    await c.query(`UPDATE feed.users SET email_verified_at = COALESCE(email_verified_at, now()), is_admin = $2, is_moderator = $2 OR (is_moderator AND kind <> 'admin'), kind = CASE WHEN $3 THEN $4 ELSE kind END,
      site_user_id = COALESCE($5, site_user_id), password_digest = CASE WHEN $3 THEN NULL ELSE password_digest END, session_version = session_version + CASE WHEN $3 THEN 1 ELSE 0 END WHERE id = $1`,
      [id, staff, up, kind, kind === "member" ? h.uid : null]);
    if (up) await c.query("DELETE FROM feed.auth_tokens WHERE user_id = $1", [id]);
  }
  return startSession(id);
}

// ---- Username (admin and member pick their own; it is never taken from their name or address)
export async function chooseUsername(userId: number, username: string) {
  const bad = usernameProblem(username);
  if (bad) throw new Refused("username_bad");
  const r = await (await conn()).query(`WITH u AS (UPDATE feed.users SET username = $2 WHERE id = $1 AND username IS NULL AND NOT EXISTS (SELECT 1 FROM feed.users WHERE lower(username) = lower($2)) RETURNING id)
    INSERT INTO feed.usernames (username, user_id) SELECT $2, id FROM u RETURNING id`, [userId, username]); // the history row starts the once-a-year rename clock, as Lobsters' Username.create! does
  if (!r.rowCount) throw new Refused("username_taken"); // also covers "already has one": renaming is done in /settings
}

// ---- External accounts
async function mailLink(to: string, subject: string, intro: string, path: string, t: string) {
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) { console.error("feed email not sent: mail is not set up"); return; }
  await sendQueued({ to, subject, text: `${intro}\n\n${feedOrigin()}${path}?t=${t}\n\nIf you didn't ask for this, you can ignore this email.` }, cfg);
}
async function newToken(userId: number, purpose: "verify" | "reset", hours: number) {
  const t = token(), c = await conn();
  await c.query("DELETE FROM feed.auth_tokens WHERE user_id = $1 AND purpose = $2 OR expires_at < now()", [userId, purpose]);
  await c.query("INSERT INTO feed.auth_tokens (hash, user_id, purpose, expires_at) VALUES ($1,$2,$3, now() + make_interval(hours => $4))", [sha(t), userId, purpose, hours]);
  return t;
}
/** Single use: the row is deleted as it is read. */
const spendToken = async (t: string, purpose: "verify" | "reset") =>
  ((await (await conn()).query("DELETE FROM feed.auth_tokens WHERE hash = $1 AND purpose = $2 AND expires_at > now() RETURNING user_id", [sha(t.slice(0, 100)), purpose])).rows[0]?.user_id as number | undefined) ?? null;

/** Registers an external account and emails a verification link. The answer is the same whether or not the address is already taken. */
export async function register(req: Request, f: { email: string; password: string; code: string }) {
  const email = f.email.trim().toLowerCase(), cfg = await getFeedConfig();
  if (cfg.signup === "closed") throw new Refused("signup_closed");
  if (!(await hit("feed:signup:" + clientIp(req), 3, 3_600_000, true))) throw new Refused("slow_down");
  if (!EMAIL_OK.test(email) || email.length > 100) throw new Refused("email_bad");
  if (passwordProblem(f.password, email)) throw new Refused("password_bad");
  const digest = await hashPassword(f.password); // the work is done either way, so timing doesn't show whether the address exists
  const client = await (await conn()).connect();
  let newId: number | null = null;
  try {
    await client.query("BEGIN");
    let inv: { id: number; user_id: number } | null = null;
    if (cfg.signup === "invite") { // a live, unused code; spent in the same step as the account
      inv = f.code.trim() ? (await client.query("UPDATE feed.invitations SET used_at = now() WHERE code = $1 AND used_at IS NULL AND created_at > now() - make_interval(days => $2) AND (email IS NULL OR lower(email) = $3) RETURNING id, user_id", [f.code.trim().slice(0, 60), cfg.invites.expiryDays, email])).rows[0] ?? null : null;
      if (!inv) throw new Refused("invite_bad");
    }
    const r = await client.query("INSERT INTO feed.users (email, password_digest, token, kind, invited_by_user_id, created_at) VALUES ($1,$2,$3,'external',$4, now()) ON CONFLICT DO NOTHING RETURNING id", [email, digest, token(), inv?.user_id ?? null]);
    newId = r.rows[0]?.id ?? null;
    if (inv && newId) await client.query("UPDATE feed.invitations SET new_user_id = $2 WHERE id = $1", [inv.id, newId]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  if (newId) await mailLink(email, "Confirm your email address", "Confirm your email address to finish creating your account:", "/login/verify", await newToken(newId, "verify", 48));
}

export async function verifyEmail(t: string) {
  const id = await spendToken(t, "verify");
  if (!id) return false;
  await (await conn()).query("UPDATE feed.users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [id]);
  return true;
}

/** Password login for external accounts. One message for every kind of failure; limited per address and per visitor. */
export async function passwordLogin(req: Request, emailIn: string, password: string): Promise<string> {
  const email = emailIn.trim().toLowerCase();
  if (!(await hit("feed:login:ip:" + clientIp(req), 20, 60_000, true)) || !(await hit("feed:login:acct:" + email.slice(0, 100), 4, 60_000, true))) throw new Refused("slow_down");
  const u = (await (await conn()).query("SELECT id, password_digest, banned_at, deleted_at FROM feed.users WHERE lower(email) = $1 AND kind = 'external'", [email])).rows[0];
  const ok = await checkPassword(password.slice(0, 200), u?.password_digest ?? DUMMY_DIGEST); // always run, whether or not the account exists
  if (!ok || !u?.password_digest) throw new Refused("login_bad");
  if (u.banned_at || u.deleted_at) { await tattle(u.id, u.banned_at ? "Attempted to log in while banned." : "Attempted to log in after deleting their account."); throw new Refused(u.banned_at || String(email).endsWith("@talk.invalid") ? "banned" : "deactivated"); }
  return startSession(u.id);
}

export async function forgotPassword(req: Request, emailIn: string) {
  const email = emailIn.trim().toLowerCase();
  if (!(await hit("feed:reset:ip:" + clientIp(req), 5, 3_600_000, true)) || !(await hit("feed:reset:acct:" + email.slice(0, 100), 3, 3_600_000, true))) throw new Refused("slow_down");
  const u = (await (await conn()).query("SELECT id FROM feed.users WHERE lower(email) = $1 AND kind = 'external' AND banned_at IS NULL AND email NOT LIKE '%@talk.invalid'", [email])).rows[0]; // a deactivated person may come back this way; one who left badly (address replaced) must ask a moderator
  if (u) await mailLink(email, "Reset your password", "Use this link to choose a new password. It works once, for one hour:", "/login/set_new_password", await newToken(u.id, "reset", 1));
}

/** Checks a reset link without using it (the page shows the form; only the form post spends it). */
export async function resetLinkValid(t: string) {
  return !!(await (await conn()).query("SELECT 1 FROM feed.auth_tokens WHERE hash = $1 AND purpose = 'reset' AND expires_at > now()", [sha(t.slice(0, 100))])).rowCount;
}
export async function setNewPassword(t: string, password: string) {
  const c = await conn(), peek = (await c.query("SELECT u.email FROM feed.auth_tokens a JOIN feed.users u ON u.id = a.user_id WHERE a.hash = $1 AND a.purpose = 'reset' AND a.expires_at > now()", [sha(t.slice(0, 100))])).rows[0];
  if (!peek) throw new Refused("link_bad");
  if (passwordProblem(password, peek.email)) throw new Refused("password_bad");
  const digest = await hashPassword(password), id = await spendToken(t, "reset");
  if (!id) throw new Refused("link_bad");
  // New password, every other session ended, address proven by the link. A self-deactivated account (not banned) comes back too.
  const back = (await c.query("SELECT 1 FROM feed.users WHERE id = $1 AND deleted_at IS NOT NULL AND banned_at IS NULL", [id])).rowCount;
  if (back) await c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, action, token) VALUES (NULL, $1, 'reactivated', $2)", [id, `moderation_${randomBytes(16).toString("hex")}`]);
  await c.query("UPDATE feed.users SET deleted_at = CASE WHEN banned_at IS NULL THEN NULL ELSE deleted_at END, password_digest = $2, session_version = session_version + 1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 AND kind = 'external'", [id, digest]);
  await c.query("DELETE FROM feed.auth_tokens WHERE user_id = $1", [id]);
  return startSession(id);
}

export async function logoutEverywhere(userId: number) {
  await (await conn()).query("UPDATE feed.users SET session_version = session_version + 1 WHERE id = $1", [userId]);
}

/** Mails a fresh confirmation link to `email` for this user (after an address change). Limited like a resend. */
export async function sendVerifyLink(userId: number, email: string) {
  if (!(await hit("feed:verify:" + userId, 5, 3_600_000, true))) return;
  await mailLink(email, "Confirm your email address", "Confirm your new email address:", "/login/verify", await newToken(userId, "verify", 48));
}

export async function resendVerification(req: Request, v: Viewer) {
  if (v.verified || v.kind !== "external" || !(await hit("feed:verify:" + v.id, 3, 3_600_000, true))) return;
  await mailLink(v.email, "Confirm your email address", "Confirm your email address to finish creating your account:", "/login/verify", await newToken(v.id, "verify", 48));
}
