import { db } from "./db";

// Google Maps API key, set under Admin > Setup (settings table, key "maps:key"). Maps keys are meant to be public in the browser (restrict them by HTTP referrer in Google Cloud), so it is stored and shown as plain text.
export async function mapsKey(): Promise<string> {
  const d = db();
  if (!d) return "";
  try { await d.ready; return String((await d.pool.query("SELECT data FROM settings WHERE key = 'maps:key'")).rows[0]?.data?.key ?? ""); } catch { return ""; }
}

/** Blank removes the key. */
export async function setMapsKey(raw: unknown) {
  const key = String(raw ?? "").trim();
  if (key && !/^[A-Za-z0-9_-]{20,80}$/.test(key)) throw new Error("That doesn't look like a Google API key (letters, numbers, - and _ only).");
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  await d.pool.query("INSERT INTO settings (key, data) VALUES ('maps:key', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ key })]);
}
