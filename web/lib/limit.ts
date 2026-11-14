import { db } from "./db";

// Rate limiter kept in Postgres so limits survive restarts and are shared by every instance. With no database configured (tests, first-run) it falls back to process memory.
// A database error lets the request through (a hiccup must not lock people out), except for callers that pass `strict` (sign-in, signing codes): they are refused instead.
// Each key is locked for the length of its check-and-insert, so a burst of parallel requests can't overshoot `max`.
const seen = new Map<string, number[]>();
const pg = async () => { const d = db(); if (!d) return null; await d.ready; return d.pool; };
/** Locks `key` and runs `body` in one transaction, sent as ONE multi-statement message: one round trip instead of five, and each statement still gets a fresh snapshot after the lock,
 *  so two requests for the same key take turns and can't overshoot. `body` gets a quoting helper; every value in it must go through it. Returns the results of body's statements. */
async function exclusive(p: NonNullable<Awaited<ReturnType<typeof pg>>>, key: string, body: (lit: (v: string | number) => string) => string): Promise<any[]> {
  const c = await p.connect();
  try {
    const lit = (v: string | number) => c.escapeLiteral(String(v));
    const r: any[] = (await c.query(`BEGIN; SELECT pg_advisory_xact_lock(hashtext(${lit("rate:" + key)})); ${body(lit)} COMMIT`)) as any;
    return r.slice(2, -1);
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
const win = (lit: (v: string | number) => string, key: string, windowMs: number) => `key = ${lit(key)} AND at > now() - make_interval(secs => ${lit(Number(windowMs) / 1000)})`;
const tidy = (p: NonNullable<Awaited<ReturnType<typeof pg>>>) => { if (Math.random() < 0.01) void p.query("DELETE FROM rate_hits WHERE at < now() - interval '1 day'").catch(() => {}); };

/** Counts one hit on `key`; false once there have been more than `max` in the last `windowMs`. */
export async function hit(key: string, max: number, windowMs: number, strict = false): Promise<boolean> {
  try {
    const p = await pg();
    if (p) {
      tidy(p);
      const [r] = await exclusive(p, key, (lit) => `SELECT count(*)::int n FROM rate_hits WHERE ${win(lit, key, windowMs)}; INSERT INTO rate_hits (key) VALUES (${lit(key)});`);
      return r.rows[0].n < max;
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
      const [r] = await exclusive(p, key, (lit) => `SELECT count(*)::int n, min(at) oldest FROM rate_hits WHERE ${win(lit, key, windowMs)};
        INSERT INTO rate_hits (key) SELECT ${lit(key)} WHERE (SELECT count(*) FROM rate_hits WHERE ${win(lit, key, windowMs)}) < ${lit(Number(max))};`);
      n = r.rows[0].n; first = r.rows[0].oldest ? +r.rows[0].oldest : now;
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
