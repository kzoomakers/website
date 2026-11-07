import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
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
export async function requestLink(emailIn: string, nameIn: string, next: string, base: string) {
  const email = emailIn.trim().toLowerCase(), name = nameIn.trim().slice(0, 80);
  if (!EMAIL_OK.test(email) || email.length > 200) throw new Error("That email address doesn't look right.");
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error(!cfg.from ? "Email isn't set up yet: the admin needs to save a Default sender address in the mail Settings." : "Email isn't set up yet: the admin needs to save an SMTP2GO API key in the mail Settings.");
  const c = await conn();
  // At most 60 links an hour for the whole site, so the form can't be used to mail-bomb other people.
  if ((await c.query("SELECT count(*)::int AS n FROM login_tokens WHERE created_at > now() - interval '1 hour'")).rows[0].n >= 60) throw new Error("Too many sign-in requests right now. Please try again later.");
  let u = (await c.query("SELECT id, name FROM site_users WHERE email = $1", [email])).rows[0];
  if (!u) {
    if (!name) return; // same answer as a sent link, so the form can't be used to find out who has an account
    u = (await c.query("INSERT INTO site_users (email, name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id, name", [email, name])).rows[0];
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
  const r = await c.query("DELETE FROM login_tokens WHERE hash = $1 AND expires_at > now() RETURNING user_id, next", [hash(token)]);
  if (!r.rows[0]) return null;
  // First verification = registration: join the "Registered users" mailing list (a failure here must not block sign-in).
  const u = (await c.query("UPDATE site_users u SET verified_at = COALESCE(u.verified_at, now()) FROM (SELECT id, verified_at AS was FROM site_users WHERE id = $1) o WHERE u.id = o.id RETURNING u.email, u.name, o.was", [r.rows[0].user_id])).rows[0];
  if (u && !u.was) await addRegistered(u.email, u.name, base).catch(() => {});
  const v = `${r.rows[0].user_id}.${Date.now() + DAYS * 864e5}`;
  return { next: r.rows[0].next as string, cookie: `${v}.${mac(v)}`, maxAge: DAYS * 86400 };
}

export async function currentReader(): Promise<Reader | null> {
  if (!db()) return null;
  const [id, exp, sig] = ((await cookies()).get(COOKIE_NAME)?.value ?? "").split(".");
  if (!sig || Number(exp) < Date.now()) return null;
  const want = mac(`${id}.${exp}`);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return (await (await conn()).query("SELECT id, email, name FROM site_users WHERE id = $1 AND verified_at IS NOT NULL", [Number(id)])).rows[0] ?? null;
}
