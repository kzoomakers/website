import { db } from "./db";

// Debug streams: each is a tag on log lines (smtp2go today; add more here) that an admin can switch on in Admin > Debug.
// While a stream is on, its lines go to the debug_log table (shown on that page) and to stdout. Errors always go to stdout.
export const STREAMS = { smtp2go: "SMTP2GO email traffic (requests, responses, failures; never the API key or message bodies)" } as const;
export type Stream = keyof typeof STREAMS;
const KEEP = 2000; // newest rows kept, so a forgotten switch can't fill the database

const g = globalThis as unknown as { dbg?: { at: number; on: Record<string, boolean> } };

/** Which streams are on. Cached for 5 s so a send doesn't cost an extra query, and a toggle takes effect almost at once. */
export async function enabled(): Promise<Record<string, boolean>> {
  if (g.dbg && Date.now() - g.dbg.at < 5000) return g.dbg.on;
  let on: Record<string, boolean> = {};
  try {
    const d = db();
    if (d) { await d.ready; on = (await d.pool.query("SELECT data FROM settings WHERE key = 'debug:streams'")).rows[0]?.data ?? {}; }
  } catch { /* no database: nothing to trap into */ }
  g.dbg = { at: Date.now(), on };
  return on;
}

export async function setStream(stream: string, on: boolean) {
  if (!(stream in STREAMS)) throw new Error("Unknown stream.");
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  await d.pool.query("INSERT INTO settings (key, data) VALUES ('debug:streams', $1) ON CONFLICT (key) DO UPDATE SET data = settings.data || EXCLUDED.data", [JSON.stringify({ [stream]: on })]);
  g.dbg = undefined;
}

/** Records a line for `stream` if it is switched on (level "error" is always printed to stdout). Never throws: debugging must not break the thing being debugged. */
export async function debugLog(stream: Stream, message: string, data?: Record<string, unknown>, level: "info" | "error" = "info") {
  try {
    const on = (await enabled())[stream];
    if (!on && level !== "error") return;
    console[level === "error" ? "error" : "log"](`[${stream}] ${message}`, data ? JSON.stringify(data) : "");
    if (!on) return;
    const d = db();
    if (!d) return;
    await d.ready;
    const id = (await d.pool.query("INSERT INTO debug_log (stream, level, message, data) VALUES ($1,$2,$3,$4) RETURNING id", [stream, level, message.slice(0, 500), data ? JSON.stringify(data) : null])).rows[0].id;
    await d.pool.query("DELETE FROM debug_log WHERE stream = $1 AND id < $2", [stream, Number(id) - KEEP]);
  } catch { /* ignore */ }
}

export async function recent(stream: string, limit = 300) {
  const d = db();
  if (!d) return [];
  await d.ready;
  return (await d.pool.query("SELECT id, at, stream, level, message, data FROM debug_log WHERE ($1 = '' OR stream = $1) ORDER BY id DESC LIMIT $2", [stream, limit])).rows as { id: number; at: string; stream: string; level: string; message: string; data: any }[];
}

export async function clearLog(stream: string) {
  const d = db();
  if (!d) return;
  await d.ready;
  await d.pool.query("DELETE FROM debug_log WHERE ($1 = '' OR stream = $1)", [stream]);
}
