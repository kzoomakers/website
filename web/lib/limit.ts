// Small in-memory rate limiter and upload size check.
// shortcut: per-process memory, so limits reset on restart and are per instance; move to the database if the site ever runs more than one instance.
const seen = new Map<string, number[]>();

/** Counts one hit on `key`; false once there have been more than `max` in the last `windowMs`. */
export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now(), list = (seen.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  if (list.length) seen.set(key, list);
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.length || now - v[v.length - 1] > 3600_000) seen.delete(k); // drop idle keys so the map can't grow forever
  return list.length <= max;
}

/** True when the request says its body is bigger than `mb` megabytes (checked before the body is read into memory). */
export const tooBig = (req: Request, mb: number) => Number(req.headers.get("content-length") ?? 0) > mb * 1024 * 1024;
