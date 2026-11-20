import { db } from "../db";

// One row in the shared settings table (key "training"): the on/off switch now; copy and the Discord webhook in later phases. Off until an administrator turns it on.
export type TrainingCfg = { enabled: boolean };
export async function trainingCfg(): Promise<TrainingCfg> {
  const d = db();
  if (!d) return { enabled: false };
  await d.ready;
  return { enabled: false, ...(await d.pool.query("SELECT data FROM settings WHERE key = 'training'")).rows[0]?.data };
}
// Asked on every members page, so remembered for 30 seconds (another server may take that long to notice a change).
let seen: { at: number; on: boolean } | undefined;
export async function trainingEnabled() {
  if (seen && Date.now() - seen.at < 30_000) return seen.on;
  const on = (await trainingCfg()).enabled === true;
  seen = { at: Date.now(), on };
  return on;
}
export async function saveTrainingCfg(c: Partial<TrainingCfg>) {
  const d = db();
  if (!d) throw new Error("No database.");
  await d.ready;
  await d.pool.query("INSERT INTO settings (key, data) VALUES ('training', $1) ON CONFLICT (key) DO UPDATE SET data = settings.data || EXCLUDED.data", [JSON.stringify({ enabled: c.enabled === true })]);
  seen = undefined;
}
