import { randomBytes } from "node:crypto";
import { conn } from "@/lib/db";
import { EMAIL_OK } from "../auth";
import { feedOrigin, getFeedConfig, type FeedConfig } from "../config";
import { SITE_NAME } from "../format";
import { feedMail } from "../mail";
import { tx } from "./submit";

// Invitations (invitations_controller, invitation.rb, user.rb can_invite?). Who may send is the `invites.who` setting; each person has at most `invites.perUserLimit` unused, unexpired codes at once; a code expires after `invites.expiryDays`
// and is tied to the address it was sent to (a code with no address, from before this rule, works for any).

export const MEMO_MAX = 375;
export type InviteResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
export type Rights = { ok: true; staff: boolean; left: number } | { ok: false; why: string };

const CODE = "abcdefghijklmnopqrstuvwxyz0123456789";
const newCode = () => Array.from(randomBytes(15), (b) => CODE[b % 36]).join("");

/** user.rb can_invite?, widened by the admin's `invites.who`. `left` is how many more codes this person may have out right now. */
export async function inviteRights(userId: number, cfg?: FeedConfig): Promise<Rights> {
  cfg ??= await getFeedConfig();
  const c = await conn();
  const u = (await c.query("SELECT username, kind, is_admin, is_moderator, karma, created_at, disabled_invite_at, disabled_invite_reason, banned_at, deleted_at, email_verified_at FROM feed.users WHERE id = $1", [userId])).rows[0];
  if (!u || !u.username || u.banned_at || u.deleted_at) return { ok: false, why: "Your account cannot send invitations." };
  if (u.is_admin || u.is_moderator) return { ok: true, staff: true, left: Infinity };
  if (u.disabled_invite_at) return { ok: false, why: `Your invitation privilege has been turned off${u.disabled_invite_reason ? `: ${u.disabled_invite_reason}` : "."}` };
  if (u.kind === "external" && !u.email_verified_at) return { ok: false, why: "Confirm your email address before inviting anyone." };
  const isNew = !u.created_at || new Date(u.created_at).getTime() > Date.now() - cfg.newUserDays * 864e5;
  const trusted = u.kind === "member" || (!isNew && u.karma >= cfg.minKarmaToSubmit);
  const allowed = cfg.invites.who === "everyone" || (cfg.invites.who === "members" && u.kind === "member") || (cfg.invites.who === "members+trusted" && trusted);
  if (!allowed) return { ok: false, why: cfg.invites.who === "staff" ? "Only moderators can send invitations here." : "You can send invitations once your account has been around a while." };
  const out = (await c.query("SELECT count(*)::int n FROM feed.invitations WHERE user_id = $1 AND used_at IS NULL AND created_at > now() - make_interval(days => $2)", [userId, cfg.invites.expiryDays])).rows[0].n as number;
  const left = Math.max(0, cfg.invites.perUserLimit - out);
  return left ? { ok: true, staff: false, left } : { ok: false, why: `You already have ${out} invitation${out === 1 ? "" : "s"} waiting to be used. Once they are used or expire you can send more.` };
}

/** Records an invitation and emails the link. The person must not already have an account here. */
export async function createInvitation(userId: number, emailIn: string, memoIn: string): Promise<InviteResult<{ email: string }>> {
  const email = emailIn.replace(/^mailto:/i, "").trim().toLowerCase(), memo = memoIn.trim();
  if (!EMAIL_OK.test(email) || email.length > 100) return { ok: false, error: "That email address doesn't look right." };
  if (memo.length > MEMO_MAX) return { ok: false, error: `The note is too long (${MEMO_MAX} characters at most).` };
  const cfg = await getFeedConfig();
  let code = "", sender = "";
  const r = await tx<InviteResult>(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('feed:invite:' || $1::text, 0))", [userId]); // two parallel sends can't both fit under the limit
    const rights = await inviteRights(userId, cfg);
    if (!rights.ok) return { ok: false, error: rights.why };
    if ((await c.query("SELECT 1 FROM feed.users WHERE lower(email) = $1", [email])).rowCount) return { ok: false, error: "That address already has an account." };
    if ((await c.query("SELECT 1 FROM feed.invitations WHERE lower(email) = $1 AND used_at IS NULL AND created_at > now() - make_interval(days => $2)", [email, cfg.invites.expiryDays])).rowCount) return { ok: false, error: "That address has already been invited." };
    sender = (await c.query("SELECT username FROM feed.users WHERE id = $1", [userId])).rows[0].username;
    for (let i = 0; i < 10; i++) { // the unique token index settles a clash
      code = newCode();
      if ((await c.query("INSERT INTO feed.invitations (user_id, email, memo, code, token) VALUES ($1, $2, $3, $4, $4) ON CONFLICT DO NOTHING RETURNING id", [userId, email, memo || null, code])).rowCount) return { ok: true };
    }
    return { ok: false, error: "Could not make a code. Please try again." };
  });
  if (!r.ok) return r;
  await feedMail(email, `[${SITE_NAME}] You are invited to join ${SITE_NAME}`,
    `Hello ${email},\n\nThe user ${sender} has invited you to ${SITE_NAME} (${feedOrigin()})${memo ? `\n\n   ${memo}` : ""}\n\nTo accept this invitation and create an account, visit the URL below:\n\n${feedOrigin()}/invitations/${code}\n\nThe invitation is good for ${cfg.invites.expiryDays} days.\n`);
  return { ok: true, email };
}

export type SentInvite = { id: number; email: string | null; memo: string | null; created_at: Date; used_at: Date | null; new_user: string | null; expires_at: Date };
/** What this person has sent, newest first (Lobsters shows these in settings). */
export async function sentInvitations(userId: number): Promise<SentInvite[]> {
  const days = (await getFeedConfig()).invites.expiryDays;
  return (await (await conn()).query(
    `SELECT i.id, i.email, i.memo, i.created_at, i.used_at, u.username AS new_user, i.created_at + make_interval(days => $2) AS expires_at
     FROM feed.invitations i LEFT JOIN feed.users u ON u.id = i.new_user_id WHERE i.user_id = $1 ORDER BY i.id DESC LIMIT 100`, [userId, days])).rows;
}

/** The address a live, unused code was sent to ("" when it wasn't tied to one); null when the code is unknown, used or expired. */
export async function liveInvitation(code: string): Promise<{ email: string } | null> {
  const days = (await getFeedConfig()).invites.expiryDays;
  const r = (await (await conn()).query("SELECT email FROM feed.invitations WHERE code = $1 AND used_at IS NULL AND created_at > now() - make_interval(days => $2)", [code.slice(0, 60), days])).rows[0];
  return r ? { email: r.email ?? "" } : null;
}

// ---- Public invitation requests (invitation_request.rb): someone with no inviter asks for one. They confirm their address by a link, and only then do people who may invite see the request.

export const REQ_NAME_MAX = 255;
const http = /^https?:\/\/[^\s<>"']+$/i;

/** Records a request and emails the confirmation link. Said the same way whatever the address (a stranger can't learn who is registered), and never throws on bad mail. */
export async function requestInvitation(ip: string, nameIn: string, emailIn: string, urlIn: string): Promise<InviteResult> {
  const cfg = await getFeedConfig();
  if (!cfg.invites.requests) return { ok: false, error: "Public invitation requests are not allowed." };
  const name = nameIn.trim(), email = emailIn.trim().toLowerCase(), url = urlIn.trim();
  if (!name || name.length > REQ_NAME_MAX) return { ok: false, error: "Please give your name." };
  if (!EMAIL_OK.test(email) || email.length > 100) return { ok: false, error: "That email address doesn't look right." };
  if (!http.test(url) || url.length > 255) return { ok: false, error: "The URL must start with http:// or https://." };
  const c = await conn();
  if (!(await c.query("SELECT 1 FROM feed.users WHERE lower(email) = $1", [email])).rowCount && !(await c.query("SELECT 1 FROM feed.invitation_requests WHERE lower(email) = $1", [email])).rowCount) {
    const code = newCode();
    await c.query("INSERT INTO feed.invitation_requests (code, email, name, memo, ip_address, token) VALUES ($1, $2, $3, $4, $5, $1)", [code, email, name, url, ip.slice(0, 64)]);
    await feedMail(email, `[${SITE_NAME}] Confirm your invitation request to ${SITE_NAME}`,
      `Hello ${email},\n\nSomeone at ${ip} has submitted an invitation request to ${SITE_NAME}.\n\n  Name: ${name}\n  Email: ${email} (won't be displayed to other users)\n  URL: ${url}\n\nIf this is you, visit the URL below to confirm your request and display it to other logged-in users.\n\n  ${feedOrigin()}/invitations/confirm/${code}\n\nIf this is not you, you can delete this message.\n`);
  }
  return { ok: true };
}

export async function confirmRequest(code: string): Promise<boolean> {
  return !!(await (await conn()).query("UPDATE feed.invitation_requests SET is_verified = true, updated_at = now() WHERE code = $1 RETURNING id", [code.slice(0, 60)])).rowCount;
}

/** Who may see the queue: anyone who can invite, if they are a moderator or have enough karma (user.rb can_see_invitation_requests?). */
export async function requestsAccess(userId: number): Promise<{ ok: boolean; moderator: boolean }> {
  const cfg = await getFeedConfig();
  if (!cfg.invites.requests) return { ok: false, moderator: false };
  const r = await inviteRights(userId, cfg);
  const u = (await (await conn()).query("SELECT karma, is_moderator FROM feed.users WHERE id = $1", [userId])).rows[0];
  return { ok: r.ok && !!u && (u.is_moderator || u.karma >= cfg.minKarmaForInviteRequests), moderator: !!u?.is_moderator };
}

export type PendingRequest = { id: number; code: string; name: string; email: string; memo: string | null; created_at: Date };
export const listRequests = async (): Promise<PendingRequest[]> => (await (await conn()).query("SELECT id, code, name, email, memo, created_at FROM feed.invitation_requests WHERE is_verified ORDER BY id DESC LIMIT 200")).rows;

/** Sends an invitation to a confirmed request and removes it from the queue. */
export async function sendForRequest(userId: number, code: string): Promise<InviteResult<{ name: string }>> {
  if (!(await requestsAccess(userId)).ok) return { ok: false, error: "Your account is not permitted to view invitation requests." };
  const ir = (await (await conn()).query("SELECT id, name, email FROM feed.invitation_requests WHERE code = $1 AND is_verified", [code.slice(0, 60)])).rows[0];
  if (!ir) return { ok: false, error: "Invalid or expired invitation request." };
  const r = await createInvitation(userId, ir.email, "");
  if (!r.ok) return r;
  await (await conn()).query("DELETE FROM feed.invitation_requests WHERE id = $1", [ir.id]);
  return { ok: true, name: ir.name };
}

export async function deleteRequest(userId: number, code: string): Promise<InviteResult> {
  if (!(await requestsAccess(userId)).ok) return { ok: false, error: "Your account is not permitted to view invitation requests." };
  const n = (await (await conn()).query("DELETE FROM feed.invitation_requests WHERE code = $1 RETURNING id", [code.slice(0, 60)])).rowCount;
  return n ? { ok: true } : { ok: false, error: "Invalid or expired invitation request." };
}
