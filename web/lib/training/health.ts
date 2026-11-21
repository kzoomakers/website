import { conn } from "../db";
import { getCfg as pushCfg, notify } from "../pushover";
import { trainingCfg } from "./settings";

// Each background job leaves "last ran, did it work" in one settings row, so the Settings page can show it and a stalled sweep can raise an alert.
export const JOBS = { sweep: "Re-pass deadline sweep (hourly)", reminders: "Re-pass reminders (every 6 hours)", push: "Staff push for passes waiting (every 15 minutes)", digest: "Trainer Monday email (hourly check)", discord: "Discord posts (every minute)", board: "Monthly overrides email to the board (hourly check)" } as const;
type Job = keyof typeof JOBS;
const key = (j: string) => `training_job:${j}`;

const wrote = new Map<string, number>(); // per process: a successful minute-by-minute job is recorded every 10 minutes, not every run
/** Wraps a job so every run is recorded; the error is rethrown so the caller's own handling is unchanged. */
export const tracked = (j: Job, fn: () => Promise<unknown>) => async () => {
  const t = Date.now();
  let ok = true, error = "";
  try { return await fn(); } catch (e) { ok = false; error = String((e as Error)?.message ?? e).slice(0, 300); throw e; }
  finally { if (ok && Date.now() - (wrote.get(j) ?? 0) < 600_000) return; wrote.set(j, Date.now()); await (await conn()).query("INSERT INTO settings (key, data) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [key(j), JSON.stringify({ at: new Date().toISOString(), ok, error, ms: Date.now() - t })]).catch(() => {}); }
};

/** What the Settings page shows: last run of each job, and how much is waiting in each queue. */
export async function jobHealth() {
  const c = await conn();
  const runs = new Map((await c.query("SELECT key, data FROM settings WHERE key LIKE 'training_job:%'")).rows.map((r) => [r.key, r.data]));
  const q = async (sql: string) => (await c.query(sql)).rows[0].n as number;
  return {
    jobs: (Object.keys(JOBS) as Job[]).map((j) => ({ job: j, label: JOBS[j], ...(runs.get(key(j)) ?? { at: null, ok: true, error: "" }) })),
    queues: [
      { label: "Passes not yet pushed to staff", n: await q("SELECT count(*)::int AS n FROM certifications WHERE state = 'passed' AND pushed_at IS NULL") },
      { label: "Discord posts waiting to send", n: await q("SELECT count(*)::int AS n FROM outbox WHERE kind = 'discord' AND sent_at IS NULL") },
    ],
  };
}

const STALE_MS = 3 * 3600_000, REPEAT_MS = 6 * 3600_000;
/** Every 30 minutes: when the deadline sweep hasn't run for 3 hours, push staff once (then again after 6 hours if still stuck). Silent while training is off or the sweep has never recorded a run. */
export async function checkSweep(now = Date.now()) {
  if (!(await trainingCfg()).enabled) return false;
  const c = await conn(), last = (await c.query("SELECT data FROM settings WHERE key = $1", [key("sweep")])).rows[0]?.data?.at;
  if (!last || now - Date.parse(last) < STALE_MS) return false;
  const p = await pushCfg(), prev = (await c.query("SELECT data FROM settings WHERE key = 'training_job:alert'")).rows[0]?.data?.at;
  if (!p.token || !p.groups.training || (prev && now - Date.parse(prev) < REPEAT_MS)) return false;
  await notify("training", { title: "Training", message: `The re-pass deadline sweep hasn't run since ${last.slice(0, 16).replace("T", " ")} UTC. Check Admin > People > Training > Settings.`, priority: 1 }, "training");
  await c.query("INSERT INTO settings (key, data) VALUES ('training_job:alert', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ at: new Date(now).toISOString() })]);
  return true;
}
