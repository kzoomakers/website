import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Pure identity helpers for the community site: login handoff tokens, session cookie, CSRF checks, passwords, input rules. No database here, so tests load it directly.

const secret = () => { const s = process.env.AUTH_SECRET; if (!s) throw new Error("AUTH_SECRET is not set"); return s; };
// One signing key per purpose: a value minted for one use can never be accepted as another, nor as a main-site cookie ("blog|").
const sign = (purpose: string, data: string) => createHmac("sha256", createHmac("sha256", secret()).update("feed|" + purpose).digest()).update(data).digest("base64url");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

// ---- Where a visitor may be sent after logging in: this site only, and never back into the login pages.
export const safeReturn = (n?: string | null) =>
  n && n.length <= 200 && /^\/(?![/\\])[\w\-/.~]*(\?[\w\-=&.]*)?$/.test(n) && !n.includes("..") && !/^\/(login|auth|signup)(\/|\?|$)/.test(n) ? n : "/";

// ---- Login handoff: the main site proves who someone is, the community site accepts it exactly once.
export type Role = "admin" | "member";
export type Handoff = { aud: string; email: string; role: Role; uid: number | null; state: string; ret: string; iat: number; exp: number; jti: string };
export const HANDOFF_SECS = 60;
export const STATE_OK = /^[\w-]{22,64}$/; // random value the community site put in its own cookie before sending the visitor away (blocks "log in as me" links)
export const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function mintHandoff(c: { email: string; role: Role; uid?: number | null; state: string; ret: string }, aud: string, now = Date.now()): string {
  if (!STATE_OK.test(c.state)) throw new Error("bad state");
  const iat = Math.floor(now / 1000);
  const p: Handoff = { aud, email: c.email.toLowerCase(), role: c.role, uid: c.uid ?? null, state: c.state, ret: safeReturn(c.ret), iat, exp: iat + HANDOFF_SECS, jti: randomBytes(16).toString("base64url") };
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign("handoff", body)}`;
}

/** The claims of a genuine, fresh, unused token for this audience and this browser (`state` = the value from its cookie), otherwise null. `consume` records the id and returns false if it was seen before. */
export async function verifyHandoff(token: string, o: { aud: string; state: string; consume: (jti: string, expSecs: number) => Promise<boolean>; now?: number }): Promise<Handoff | null> {
  const parts = token.split(".");
  if (parts.length !== 2 || token.length > 2000 || !same(parts[1], sign("handoff", parts[0]))) return null;
  let p: any;
  try { p = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { return null; }
  const s = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  if (!p || !s(p.aud, 100) || !s(p.email, 200) || !EMAIL_OK.test(p.email) || (p.role !== "admin" && p.role !== "member") || !s(p.state, 64) || !s(p.jti, 40) || typeof p.ret !== "string"
    || !Number.isInteger(p.iat) || !Number.isInteger(p.exp) || !(p.uid === null || Number.isInteger(p.uid))) return null;
  const now = Math.floor((o.now ?? Date.now()) / 1000);
  if (p.aud !== o.aud || !o.state || !same(p.state, o.state)) return null;
  if (p.exp - p.iat > HANDOFF_SECS || now >= p.exp || p.iat > now + 5) return null;
  if (!(await o.consume(p.jti, p.exp))) return null; // last, so only a token that passed every other check uses up its id
  return { ...p, ret: safeReturn(p.ret) };
}

// ---- Session cookie: id.expiry.version.mac. Bumping feed.users.session_version signs that person out everywhere.
export const SESSION_COOKIE = "feed_session";
export const SESSION_DAYS = 30;
export const sessionValue = (id: number, ver: number, now = Date.now()) => { const v = `${id}.${now + SESSION_DAYS * 864e5}.${ver}`; return `${v}.${sign("session", v)}`; };
export function readSession(value?: string, now = Date.now()): { id: number; ver: number } | null {
  const [id, exp, ver, mac, extra] = (value ?? "").split(".");
  if (!mac || extra !== undefined || !(Number(exp) > now) || !same(mac, sign("session", `${id}.${exp}.${ver}`))) return null;
  return Number.isSafeInteger(Number(id)) && Number.isSafeInteger(Number(ver)) ? { id: Number(id), ver: Number(ver) } : null;
}
export const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

// ---- CSRF. Every state-changing request is a POST (SameSite=Lax cookies are not sent cross-site on POST) and must say it came from this very site.
export function originOk(h: Headers): boolean {
  const host = h.get("host")?.toLowerCase(), origin = h.get("origin"), fetchSite = h.get("sec-fetch-site");
  if (!host || !origin || (fetchSite && fetchSite !== "same-origin")) return false; // browsers always send Origin on a POST; a missing one is refused
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}
/** A form token tied to this login: pages show it to the signed-in person, forms that change their account send it back. */
export const csrfFor = (sessionCookie: string) => sign("csrf", sessionCookie);
export const csrfOk = (sessionCookie: string, token: string) => !!sessionCookie && !!token && same(token, csrfFor(sessionCookie));

// ---- Passwords: scrypt with the cost stored in the digest, so it can be raised later.
const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, n: number, o: object) => Promise<Buffer>;
const N = 32768, OPTS = (n: number) => ({ N: n, r: 8, p: 1, maxmem: 128 * n * 8 * 2 });
export async function hashPassword(pw: string) { const salt = randomBytes(16); return `scrypt$${N}$${salt.toString("hex")}$${(await scryptAsync(pw, salt, 64, OPTS(N))).toString("hex")}`; }
export async function checkPassword(pw: string, digest: string) {
  const [alg, n, salt, hash] = digest.split("$"), cost = Number(n);
  if (alg !== "scrypt" || !(cost >= 16384 && cost <= 1 << 20) || !salt || !hash) return false;
  const want = Buffer.from(hash, "hex"), got = await scryptAsync(pw, Buffer.from(salt, "hex"), want.length || 64, OPTS(cost));
  return want.length === got.length && timingSafeEqual(want, got);
}
export const DUMMY_DIGEST = `scrypt$${N}$${"00".repeat(16)}$${"00".repeat(64)}`; // checked when the account doesn't exist, so timing doesn't reveal who has one
export const passwordProblem = (p: string, email = "") =>
  p.length < 10 ? "Passwords need at least 10 characters." : p.length > 200 ? "That password is too long." : p.toLowerCase() === email.toLowerCase() ? "Your password can't be your email address." : "";

// ---- Names. Usernames show in pages and URLs, so only letters, digits, "_" and "-" (it can never hold markup).
export const USERNAME_OK = /^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/;
const RESERVED = new Set(["admin", "administrator", "root", "system", "moderator", "mod", "staff", "support", "help", "kzoomakers", "kzoomaker", "makers", "inactive-user", "anonymous", "deleted", "null", "undefined", "me", "you", "talk"]);
export const usernameProblem = (u: string) => !USERNAME_OK.test(u) ? "Usernames are 2 to 24 letters, digits, _ or -, starting with a letter or digit." : RESERVED.has(u.toLowerCase()) ? "That username is reserved." : "";
