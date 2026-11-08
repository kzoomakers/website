import { createHash, randomBytes } from "crypto";
import { db } from "./db";

// Scoped API keys for other systems (YAMNet today). The key is shown once; only its SHA-256 is kept. A key may do only what its scopes say.
export const SCOPES: Record<string, string> = { "chores:read": "Read chores, what's due, and volunteer hours", "chores:write": "Mark chores started, done or logged for a member" };
export const EXPIRY: Record<string, number | null> = { never: null, "1m": 30, "6m": 183, "1y": 365 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

let ready: Promise<unknown> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= d.pool.query(`CREATE TABLE IF NOT EXISTS api_keys (hash text PRIMARY KEY, label text NOT NULL, scopes text[] NOT NULL, expires_at timestamptz, created_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz)`).catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}

export async function listKeys() {
  return (await (await conn()).query("SELECT hash, label, scopes, expires_at, created_by, created_at, last_used_at FROM api_keys ORDER BY created_at DESC")).rows;
}

export async function createKey(x: any, who: string) {
  const label = String(x.label ?? "").trim().slice(0, 80), scopes: string[] = Array.isArray(x.scopes) ? x.scopes : [], exp = String(x.expires ?? "never");
  if (!label) throw new Error("Give the key a label, such as the system it is for.");
  if (!scopes.length || !scopes.every((s) => s in SCOPES)) throw new Error("Pick what the key may do.");
  if (!(exp in EXPIRY)) throw new Error("Pick how long the key should last.");
  const key = "ak_" + randomBytes(24).toString("base64url");
  await (await conn()).query("INSERT INTO api_keys (hash, label, scopes, expires_at, created_by) VALUES ($1,$2,$3,CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(days => $4::int) END,$5)", [sha(key), label, scopes, EXPIRY[exp], who]);
  return key;
}

export async function deleteKey(hash: string) {
  await (await conn()).query("DELETE FROM api_keys WHERE hash = $1", [hash]);
}

/** The key's label if the request carries a live key (Authorization: Bearer ak_...) holding the scope; null otherwise. */
export async function keyAllows(req: Request, scope: string): Promise<string | null> {
  const m = /^bearer (ak_\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const p = await conn(), h = sha(m[1]);
  const k = (await p.query("SELECT label, scopes FROM api_keys WHERE hash = $1 AND (expires_at IS NULL OR expires_at > now())", [h])).rows[0];
  if (!k || !k.scopes.includes(scope)) return null;
  p.query("UPDATE api_keys SET last_used_at = now() WHERE hash = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')", [h]).catch(() => {});
  return k.label;
}
