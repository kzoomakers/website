import { db } from "./db";
import { DEFAULTS, normalize, type SecHeaders } from "./sechead";

// Read on every request by middleware, so it is cached for 30 seconds per process (a saved change reaches every instance within that).
const g = globalThis as unknown as { sechead?: { at: number; v: SecHeaders } };
const TTL = 30_000;

export async function getSecHeaders(): Promise<SecHeaders> {
  if (g.sechead && Date.now() - g.sechead.at < TTL) return g.sechead.v;
  let v = DEFAULTS;
  try {
    const d = db();
    if (d) { await d.ready; v = normalize((await d.pool.query("SELECT data FROM settings WHERE key = 'sechead'")).rows[0]?.data); }
  } catch { /* database down: keep the defaults rather than serving no protection */ }
  g.sechead = { at: Date.now(), v };
  return v;
}

export async function saveSecHeaders(x: unknown, who: string, action = "security.save", target = "") {
  const v = normalize(x), d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  await d.pool.query(`INSERT INTO settings (key, data) VALUES ('sechead', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify(v)]);
  const { logAudit } = await import("./store");
  await logAudit(who, action, target || "edited security headers", v);
  g.sechead = { at: Date.now(), v };
  return v;
}
