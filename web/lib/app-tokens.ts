import { createHash, randomBytes } from "crypto";
import { conn } from "./db";

// Sign-in tokens for the phone app, one per device. "member" tokens belong to a site account; "admin" tokens to an allow-listed Google admin.
// Only the SHA-256 is stored, so a database leak gives no working token, and deleting the row signs that device out.
export const DAYS = 365;
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function issueToken(kind: "member" | "admin", email: string, device: string, userId?: number): Promise<string> {
  const token = (kind === "member" ? "mt_" : "at_") + randomBytes(32).toString("base64url"), c = await conn();
  await c.query("DELETE FROM app_tokens WHERE expires_at < now()");
  await c.query(`INSERT INTO app_tokens (hash, kind, user_id, email, ver, device, expires_at)
    VALUES ($1,$2,$3,$4, COALESCE((SELECT session_version FROM site_users WHERE id = $3), 0), $5, now() + make_interval(days => $6))`, [hashToken(token), kind, userId ?? null, email, device.slice(0, 80), DAYS]);
  return token;
}

/** Notes use (at most every 10 minutes per token, so reading isn't a write each time). */
export const touch = (hash: string) => conn().then((c) => c.query("UPDATE app_tokens SET last_used_at = now() WHERE hash = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '10 minutes')", [hash])).catch(() => {});

/** The email of a live admin token, or null. (The caller still checks the allow-list.) */
export async function adminTokenEmail(token: string): Promise<string | null> {
  const h = hashToken(token), r = (await (await conn()).query("SELECT email FROM app_tokens WHERE hash = $1 AND kind = 'admin' AND expires_at > now()", [h])).rows[0];
  if (r) void touch(h);
  return r?.email ?? null;
}

export async function listTokens() {
  return (await (await conn()).query(`SELECT t.hash, t.kind, t.email, COALESCE(u.name, '') AS name, t.device, t.created_at, t.last_used_at, t.expires_at
    FROM app_tokens t LEFT JOIN site_users u ON u.id = t.user_id WHERE t.expires_at > now() ORDER BY t.email, t.created_at DESC`)).rows;
}
export const revokeToken = async (hash: string) => (await (await conn()).query("DELETE FROM app_tokens WHERE hash = $1", [hash])).rowCount;
export const revokePerson = async (email: string) => (await (await conn()).query("DELETE FROM app_tokens WHERE lower(email) = lower($1)", [email])).rowCount;
/** Sign out the devices whose tokens were presented (the app's own Sign out). */
export const revokePresented = async (tokens: string[]) => { for (const t of tokens) await revokeToken(hashToken(t)); };

// Who a token belongs to, for the request log only (not for access). Kept 60 s per token so a busy phone isn't a query per request.
const seen = new Map<string, { who: string | null; at: number }>();
export async function logUser(authorization: string, adminToken: string): Promise<string | null> {
  const t = adminToken || /^bearer (\S+)$/i.exec(authorization)?.[1];
  if (!t) return null;
  const hit = seen.get(t);
  if (hit && Date.now() - hit.at < 60_000) return hit.who;
  const r = (await (await conn()).query("SELECT kind, user_id, email FROM app_tokens WHERE hash = $1 AND expires_at > now()", [hashToken(t)])).rows[0];
  if (seen.size >= 500) seen.clear();
  const who = r ? (r.kind === "admin" ? `google:${r.email}` : `site:${r.user_id}`) : null;
  seen.set(t, { who, at: Date.now() });
  return who;
}
