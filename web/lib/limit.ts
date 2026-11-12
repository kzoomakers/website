import { db } from "./db";

// Rate limiter kept in Postgres so limits survive restarts and are shared by every instance. With no database configured (tests, first-run) it falls back to process memory.
// A database error lets the request through (a hiccup must not lock people out), except for callers that pass `strict` (sign-in, signing codes): they are refused instead.
// Each key is locked for the length of its check-and-insert, so a burst of parallel requests can't overshoot `max`.
const seen = new Map<string, number[]>();
const pg = async () => { const d = db(); if (!d) return null; await d.ready; return d.pool; };
const WINDOW = "key = $1 AND at > now() - make_interval(secs => $2)";
/** Runs `fn` in a transaction that holds a lock on `key`, so two requests for the same key take turns. */
async function exclusive<T>(p: NonNullable<Awaited<ReturnType<typeof pg>>>, key: string, fn: (q: (sql: string, args: unknown[]) => Promise<any>) => Promise<T>): Promise<T> {
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["rate:" + key]);
    const r = await fn((sql, args) => c.query(sql, args));
    await c.query("COMMIT");
    return r;
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
const tidy = (p: NonNullable<Awaited<ReturnType<typeof pg>>>) => { if (Math.random() < 0.01) void p.query("DELETE FROM rate_hits WHERE at < now() - interval '1 day'").catch(() => {}); };

/** Counts one hit on `key`; false once there have been more than `max` in the last `windowMs`. */
export async function hit(key: string, max: number, windowMs: number, strict = false): Promise<boolean> {
  try {
    const p = await pg();
    if (p) {
      tidy(p);
      return await exclusive(p, key, async (q) => {
        const n = (await q(`SELECT count(*)::int n FROM rate_hits WHERE ${WINDOW}`, [key, windowMs / 1000])).rows[0].n;
        await q("INSERT INTO rate_hits (key) VALUES ($1)", [key]);
        return n < max;
      });
    }
  } catch (e) { console.error("rate limit:", e); return !strict; }
  const now = Date.now(), list = (seen.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  seen.set(key, list);
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.length || now - v[v.length - 1] > 3600_000) seen.delete(k);
  return list.length <= max;
}

/** True when the request says its body is bigger than `mb` megabytes (checked before the body is read into memory). */
export const tooBig = (req: Request, mb: number) => Number(req.headers.get("content-length") ?? 0) > mb * 1024 * 1024;

/** Spends one call from `key`'s allowance of `max` per `windowMs` (rejected tries aren't counted). `mins` = minutes until the oldest counted call expires. */
export async function spend(key: string, max: number, windowMs: number) {
  const now = Date.now();
  let first = 0, n = 0;
  try {
    const p = await pg();
    if (p) {
      tidy(p);
      await exclusive(p, key, async (q) => {
        const r = (await q(`SELECT count(*)::int n, min(at) oldest FROM rate_hits WHERE ${WINDOW}`, [key, windowMs / 1000])).rows[0];
        n = r.n; first = r.oldest ? +r.oldest : now;
        if (n < max) await q("INSERT INTO rate_hits (key) VALUES ($1)", [key]);
      });
    } else {
      const list = (seen.get(key) ?? []).filter((t) => now - t < windowMs);
      n = list.length; first = list[0] ?? now;
      if (n < max) list.push(now);
      seen.set(key, list);
    }
  } catch (e) { console.error("rate limit:", e); return { ok: true, used: 0, left: max, mins: 0 }; }
  const ok = n < max, used = n + (ok ? 1 : 0);
  return { ok, used, left: max - used, mins: used ? Math.max(1, Math.ceil((first + windowMs - now) / 60000)) : 0 };
}
