import { db } from "./db";
import { checkLimits, DEFAULT_PUBLIC_MB, DEFAULT_UPLOAD_MB, MAX_PUBLIC_MB, MAX_UPLOAD_MB } from "./upload-limit";

export type Limits = { mb: number; publicMb: number };
let cache: { v: Limits; at: number } | undefined;

/** The limits staff set under Admin > Setup, else the defaults. Cached 30 s per server (`fresh` skips the cache, for the admin screen). Never throws: no database means the defaults. */
export async function uploadLimits(fresh = false): Promise<Limits> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.v;
  let v: Limits = { mb: DEFAULT_UPLOAD_MB, publicMb: DEFAULT_PUBLIC_MB };
  const d = db();
  if (d) try {
    await d.ready;
    const s = (await d.pool.query("SELECT data FROM settings WHERE key = 'upload:max_mb'")).rows[0]?.data;
    const mb = Math.floor(Number(s?.mb)), pub = Math.floor(Number(s?.publicMb));
    if (mb >= 1) v.mb = Math.min(mb, MAX_UPLOAD_MB);
    if (pub >= 1) v.publicMb = Math.min(pub, MAX_PUBLIC_MB, v.mb);
  } catch { /* no setting: the defaults */ }
  v = { ...v, publicMb: Math.min(v.publicMb, v.mb) };
  cache = { v, at: Date.now() };
  return v;
}
export const uploadLimitMb = async () => (await uploadLimits()).mb;

export async function setUploadLimits(l: Limits) {
  checkLimits(l);
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  await d.pool.query("INSERT INTO settings (key, data) VALUES ('upload:max_mb', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(l)]);
  cache = undefined;
}
