import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { db } from "./db";
import { addRegistered, getMailCfg, mailReady, send } from "./mail";

// Site accounts (readers): passwordless. Registering and signing in are the same step: we email a one-time link,
// clicking it verifies the address and starts a session (signed cookie). Only verified users can comment.
export type Reader = { id: number; email: string; name: string };

const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const COOKIE_NAME = "blog_session";
const DAYS = 30;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const safeNext = (n?: string | null) => (n && /^\/(?![\/\\])[\w\-\/.%?=&#~+]*$/.test(n) ? n : "/"); // same-site paths only
const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
const PW_MIN = 10;
async function hashPw(p: string) { const salt = randomBytes(16); return `${salt.toString("hex")}:${(await scryptAsync(p, salt, 64)).toString("hex")}`; }
async function checkPw(p: string, stored: string) {
  const [s, h] = stored.split(":"), want = Buffer.from(h ?? "", "hex"), got = await scryptAsync(p, Buffer.from(s ?? "", "hex"), 64);
  return want.length === got.length && timingSafeEqual(want, got);
}
const pwProblem = (p: string) => (p.length < PW_MIN ? `Passwords need at least ${PW_MIN} characters.` : p.length > 200 ? "That password is too long." : "");
export const disabledMsg = (reason?: string | null) => reason?.trim() || "Account is disabled";
const esc = (s: string) => s.replace(/[<>&"]/g, "");

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}
const mac = (v: string) => createHmac("sha256", secret()).update("blog|" + v).digest("hex");

/** Emails the sign-in link. Known and unknown addresses get the same response (no account probing). */
export async function requestLink(emailIn: string, nameIn: string, next: string, base: string, password = "") {
  const email = emailIn.trim().toLowerCase(), name = nameIn.trim().slice(0, 80);
  if (!EMAIL_OK.test(email) || email.length > 200) throw new Error("That email address doesn't look right.");
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error(!cfg.from ? "Email isn't set up yet: the admin needs to save a Default sender address in the mail Settings." : "Email isn't set up yet: the admin needs to save an SMTP2GO API key in the mail Settings.");
  const c = await conn();
  // At most 60 links an hour for the whole site, so the form can't be used to mail-bomb other people.
  if ((await c.query("SELECT count(*)::int AS n FROM login_tokens WHERE created_at > now() - interval '1 hour' AND next NOT LIKE '/members/inbox/%'")).rows[0].n >= 60) throw new Error("Too many sign-in requests right now. Please try again later.");
  let u = (await c.query("SELECT id, name, disabled_at, disabled_reason FROM site_users WHERE email = $1", [email])).rows[0];
  if (u?.disabled_at) throw new Error(disabledMsg(u.disabled_reason));
  if (!u) {
    if (password && pwProblem(password)) throw new Error(pwProblem(password));
    if (!name) return; // same answer as a sent link, so the form can't be used to find out who has an account
    // The password only counts for a brand-new account (never overwrites an existing one), and works once the emailed link has verified the address.
    // shortcut: check-then-insert, so a burst can overshoot the cap by a few; fine for a spam brake.
    if ((await signupsThisHour()) >= SIGNUPS_PER_HOUR) throw new Error("We're getting a lot of sign-ups right now. Please try again in a little while.");
    u = (await c.query("INSERT INTO site_users (email, name, first_name, last_name, password_hash, approval) VALUES ($1, $2, $3, $4, $5, 'pending') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id, name", [email, name, name.split(" ")[0], name.split(" ").slice(1).join(" "), password ? await hashPw(password) : null])).rows[0];
  }
  // shortcut: limits only per address (one email a minute); add per-IP limiting if someone abuses the form to spam other people's inboxes.
  if ((await c.query("SELECT 1 FROM login_tokens WHERE user_id = $1 AND created_at > now() - interval '60 seconds'", [u.id])).rowCount) return;
  await c.query("DELETE FROM login_tokens WHERE expires_at < now()");
  const token = randomBytes(32).toString("hex");
  await c.query("INSERT INTO login_tokens (hash, user_id, next, expires_at) VALUES ($1,$2,$3, now() + interval '30 minutes')", [hash(token), u.id, safeNext(next)]);
  const link = `${base}/blog/verify?t=${token}`;
  await send({ to: email, subject: "Your sign-in link",
    text: `Hi ${u.name},\n\nClick to sign in to the Kzoo Makers website (the link works once, for 30 minutes):\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: `<p>Hi ${esc(u.name)},</p><p><a href="${link}">Sign in to the Kzoo Makers website</a> (the link works once, for 30 minutes).</p><p>If you didn't ask for this, you can ignore this email.</p>` }, cfg);
}

/** Spends a link; returns where to send the reader next and the signed session value for the cookie. */
export async function consumeLink(token: string, base: string) {
  const c = await conn();
  const r = await c.query("DELETE FROM login_tokens WHERE hash = $1 AND expires_at > now() RETURNING user_id, next, reset", [hash(token)]);
  if (!r.rows[0] || (await c.query("SELECT 1 FROM site_users WHERE id = $1 AND disabled_at IS NOT NULL", [r.rows[0].user_id])).rowCount) return null;
  // First verification = registration: join the "Registered users" mailing list (a failure here must not block sign-in).
  const u = (await c.query("UPDATE site_users u SET verified_at = COALESCE(u.verified_at, now()) FROM (SELECT id, verified_at AS was FROM site_users WHERE id = $1) o WHERE u.id = o.id RETURNING u.email, u.name, o.was", [r.rows[0].user_id])).rows[0];
  if (u && !u.was) {
    // The very first verified account on a fresh site becomes the admin (and is approved). shortcut: two simultaneous first verifications could both miss; a Google ADMIN_EMAILS admin can grant access instead.
    const founder = (await (await conn()).query("INSERT INTO user_perms (user_id, section, level, locked) SELECT $1, 'admin', 'write', true WHERE NOT EXISTS (SELECT 1 FROM site_users WHERE verified_at IS NOT NULL AND id <> $1)", [r.rows[0].user_id])).rowCount;
    if (founder) { await (await conn()).query("UPDATE site_users SET approval = 'approved' WHERE id = $1", [r.rows[0].user_id]); await addRegistered(u.email, u.name, base).catch(() => {}); }
    else await import("./approvals").then((a) => a.applied(r.rows[0].user_id)).catch(() => {}); // joins the "Registered users" list once approved
  }
  // An admin-sent reset link also retires the old password, so the account page offers "set a password" without asking for the current one.
  if (r.rows[0].reset) await c.query("UPDATE site_users SET password_hash = NULL WHERE id = $1", [r.rows[0].user_id]);
  return { next: r.rows[0].reset ? "/account?reset=1" : await afterSignIn(r.rows[0].user_id, r.rows[0].next), ...session(r.rows[0].user_id) };
}

/** Where to send someone who just signed in: applicants to their approval page, then members through any unfinished first-time steps (details + emergency contact). Add later onboarding steps here. */
export async function afterSignIn(userId: number, next: string) {
  const u = (await (await conn()).query("SELECT approval, phone = '' OR address1 = '' AS thin, NOT EXISTS (SELECT 1 FROM emergency_contacts WHERE user_id = $1) AS no_contact FROM site_users WHERE id = $1", [userId])).rows[0];
  if (u?.approval !== "approved") return "/members";
  return u.thin || u.no_contact ? `/account?setup=1&next=${encodeURIComponent(safeNext(next))}` : safeNext(next);
}

/** A one-time sign-in link that lands on `next` (used by message emails). It works once; whoever holds it gets into that account until then, so it's short-lived and only meant for the person it was sent to. */
export async function loginLink(userId: number, next: string, base: string, days = 7) {
  const token = randomBytes(32).toString("hex");
  await (await conn()).query("INSERT INTO login_tokens (hash, user_id, next, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4))", [hash(token), userId, safeNext(next), days]);
  return `${base}/blog/verify?t=${token}`;
}

/** Emails a member a one-time link that signs them in and lets them choose a new password (their old one stops working when they click it). */
export async function sendReset(userId: number, base: string) {
  const c = await conn(), cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email isn't set up yet (see the mail Settings).");
  const u = (await c.query("SELECT email, name FROM site_users WHERE id = $1", [userId])).rows[0];
  if (!u) throw new Error("No such user.");
  const token = randomBytes(32).toString("hex");
  await c.query("INSERT INTO login_tokens (hash, user_id, next, reset, expires_at) VALUES ($1,$2,'/account',true, now() + interval '24 hours')", [hash(token), userId]);
  const link = `${base}/blog/verify?t=${token}`;
  await send({ to: u.email, subject: "Reset your password",
    text: `Hi ${u.name},\n\nAn administrator sent you a link to reset your password for the Kzoo Makers website. It works once, for 24 hours:\n\n${link}\n\nIf you weren't expecting this, you can ignore this email.`,
    html: `<p>Hi ${esc(u.name)},</p><p>An administrator sent you a link to <a href="${link}">reset your password</a> for the Kzoo Makers website. It works once, for 24 hours.</p><p>If you weren't expecting this, you can ignore this email.</p>` }, cfg);
}

/** Admin sets a member's password directly. */
export async function adminSetPassword(userId: number, password: string) {
  const bad = pwProblem(password);
  if (bad) throw new Error(bad);
  if (!(await (await conn()).query("UPDATE site_users SET password_hash = $2 WHERE id = $1", [userId, await hashPw(password)])).rowCount) throw new Error("No such user.");
}

const session = (userId: number) => { const v = `${userId}.${Date.now() + DAYS * 864e5}`; return { cookie: `${v}.${mac(v)}`, maxAge: DAYS * 86400 }; };

/** Password sign-in (verified accounts that set a password). One generic error for every failure; throttled per address and site-wide. */
export async function passwordLogin(emailIn: string, password: string) {
  const email = emailIn.trim().toLowerCase(), c = await conn();
  await c.query("DELETE FROM login_fails WHERE at < now() - interval '1 hour'");
  const n = (await c.query("SELECT count(*) FILTER (WHERE email = $1 AND at > now() - interval '15 minutes')::int AS mine, count(*)::int AS total FROM login_fails", [email])).rows[0];
  if (n.mine >= 5 || n.total >= 500) throw new Error("Too many attempts. Wait a few minutes, or use an emailed link instead.");
  const u = (await c.query("SELECT id, password_hash, disabled_at, disabled_reason FROM site_users WHERE email = $1 AND verified_at IS NOT NULL", [email])).rows[0];
  // Hash even for unknown addresses so response time doesn't reveal who has an account.
  const ok = (await checkPw(password.slice(0, 200), u?.password_hash ?? "00:00")) && !!u?.password_hash;
  if (!ok) { await c.query("INSERT INTO login_fails (email) VALUES ($1)", [email]); throw new Error("Wrong email or password."); }
  if (u.disabled_at) throw new Error(disabledMsg(u.disabled_reason)); // only after the password was right, so this doesn't reveal accounts
  return { ...session(u.id), userId: u.id as number };
}

export const SIGNUPS_PER_HOUR = 3;
/** New accounts made in the last hour (or since an admin pressed reset, if later). */
export async function signupsThisHour() {
  return (await (await conn()).query("SELECT count(*)::int n FROM site_users WHERE created_at > GREATEST(now() - interval '1 hour', COALESCE((SELECT (data->>'at')::timestamptz FROM settings WHERE key = 'signup:reset'), '-infinity'))")).rows[0].n as number;
}
export async function resetSignups() {
  await (await conn()).query("INSERT INTO settings (key, data) VALUES ('signup:reset', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ at: new Date().toISOString() })]);
}

export async function hasPassword(userId: number) {
  return !!(await (await conn()).query("SELECT 1 FROM site_users WHERE id = $1 AND password_hash IS NOT NULL", [userId])).rowCount;
}

/** Sets or changes the signed-in reader's password; an account that already has one must give the current one. */
export async function setPassword(userId: number, password: string, current = "") {
  const bad = pwProblem(password);
  if (bad) throw new Error(bad);
  const stored = (await (await conn()).query("SELECT password_hash FROM site_users WHERE id = $1", [userId])).rows[0]?.password_hash;
  if (stored && !(await checkPw(current.slice(0, 200), stored))) throw new Error("Your current password isn't right.");
  await (await conn()).query("UPDATE site_users SET password_hash = $2 WHERE id = $1", [userId, await hashPw(password)]);
}

/** The user in the signed session cookie, whatever their approval state (verified and not disabled). Only the applicant pages use this; everything else wants currentVerified. */
export async function currentApplicant(): Promise<(Reader & { approval: string }) | null> {
  if (!db()) return null;
  const [id, exp, sig] = ((await cookies()).get(COOKIE_NAME)?.value ?? "").split(".");
  if (!sig || Number(exp) < Date.now()) return null;
  const want = mac(`${id}.${exp}`);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return (await (await conn()).query("SELECT id, email, name, approval FROM site_users WHERE id = $1 AND verified_at IS NOT NULL AND disabled_at IS NULL", [Number(id)])).rows[0] ?? null;
}

/** Signed-in, verified and not rejected, approved or not: enough for blog comments and the Account page. Members-only features must use currentMember instead. */
export async function currentVerified(): Promise<Reader | null> {
  const u = await currentApplicant();
  return u && u.approval !== "rejected" ? { id: u.id, email: u.email, name: u.name } : null;
}

/** A signed-in, approved member. Everything members-only (directory, classes, tools, inbox, alerts, reviews, admin access) uses this, so people still in the approval queue are left out, now and for any feature added later. */
export async function currentMember(): Promise<Reader | null> {
  const u = await currentApplicant();
  return u?.approval === "approved" ? { id: u.id, email: u.email, name: u.name } : null;
}
