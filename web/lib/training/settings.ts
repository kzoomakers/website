import { db } from "../db";
import { EVENTS } from "./copy";

// One row in the shared settings table (key "training"): the on/off switch now; copy and the Discord webhook in later phases. Off until an administrator turns it on.
export type TrainingCfg = { enabled: boolean; events: Record<string, boolean>; copy: Record<string, { subject: string; body: string }>; reply_to: string; reminder_days: number[] };
export async function trainingCfg(): Promise<TrainingCfg> {
  const d = db();
  if (!d) return { enabled: false, events: {}, copy: {}, reply_to: "", reminder_days: [14, 7, 3, 1, 0] };
  await d.ready;
  return { enabled: false, events: {}, copy: {}, reply_to: "", reminder_days: [14, 7, 3, 1, 0], ...(await d.pool.query("SELECT data FROM settings WHERE key = 'training'")).rows[0]?.data };
}
// Asked on every members page, so remembered for 5 seconds (another server may take that long to notice a change).
let seen: { at: number; on: boolean } | undefined;
export async function trainingEnabled() {
  if (seen && Date.now() - seen.at < 5_000) return seen.on;
  const on = (await trainingCfg()).enabled === true;
  seen = { at: Date.now(), on };
  return on;
}
export async function saveTrainingCfg(c: Partial<TrainingCfg>) {
  const d = db();
  if (!d) throw new Error("No database.");
  await d.ready;
  await d.pool.query("INSERT INTO settings (key, data) VALUES ('training', $1) ON CONFLICT (key) DO UPDATE SET data = settings.data || EXCLUDED.data", [JSON.stringify({ ...(c.enabled !== undefined ? { enabled: c.enabled === true } : {}), ...(c.events ? { events: c.events } : {}), ...(c.copy ? { copy: c.copy } : {}), ...(c.reply_to !== undefined ? { reply_to: c.reply_to } : {}), ...(c.reminder_days ? { reminder_days: c.reminder_days } : {}) })]);
  seen = undefined;
}

/** Cleans what the Settings page sends: only known events, bounded text, a sane reminder list. */
export function cleanCfg(b: any): Partial<TrainingCfg> {
  const out: Partial<TrainingCfg> = {}, str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  if (b?.events && typeof b.events === "object") out.events = Object.fromEntries(Object.keys(EVENTS).filter((k) => k in b.events).map((k) => [k, b.events[k] !== false]));
  if (b?.copy && typeof b.copy === "object") out.copy = Object.fromEntries(Object.keys(EVENTS).filter((k) => b.copy[k]?.subject?.trim() && b.copy[k]?.body?.trim()).map((k) => [k, { subject: str(b.copy[k].subject, 200).trim(), body: str(b.copy[k].body, 3000) }]));
  if (typeof b?.reply_to === "string") { const r = b.reply_to.trim(); if (r && !/^[^\s@]+@[^\s@]+$/.test(r)) throw new Error("Reply-to must be an email address."); out.reply_to = r; }
  if (Array.isArray(b?.reminder_days)) out.reminder_days = [...new Set(b.reminder_days.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 90))].sort((a: any, b: any) => b - a).slice(0, 8) as number[];
  return out;
}
