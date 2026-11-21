import { db } from "./db";
import { saveTrainingCfg, trainingEnabled } from "./training/settings";

// Which member workflows this space uses. A space may run classes, online training tests, both or neither; tool authorizations themselves
// (staff granting and members seeing them) are always on. Classes default to on so nothing changes for a space that never visits the setting.
// Online tests are the Training switch (settings key "training"), so there is one source of truth for it.
export type Features = { classes: boolean; tests: boolean };
let seen: { at: number; classes: boolean } | undefined;

/** Asked on every members page, so the classes switch is remembered for 5 seconds (another server may take that long to notice a change). The tests switch has its own cache in settings.ts, cleared when it is saved, so changing it from either screen shows at once. */
export async function features(): Promise<Features> {
  if (!seen || Date.now() - seen.at > 5_000) {
    const d = db();
    seen = { at: Date.now(), classes: d ? (await d.ready, (await d.pool.query("SELECT data FROM settings WHERE key = 'features'")).rows[0]?.data?.classes !== false) : true };
  }
  return { classes: seen.classes, tests: await trainingEnabled() };
}
export const classesOn = async () => (await features()).classes;

export async function saveFeatures(b: { classes?: unknown; tests?: unknown }, who: string, log: (who: string, action: string, target: string) => Promise<unknown>) {
  const d = db();
  if (!d) throw new Error("No database.");
  await d.ready;
  if (typeof b.classes === "boolean") await d.pool.query("INSERT INTO settings (key, data) VALUES ('features', $1) ON CONFLICT (key) DO UPDATE SET data = settings.data || EXCLUDED.data", [JSON.stringify({ classes: b.classes })]);
  if (typeof b.tests === "boolean") await saveTrainingCfg({ enabled: b.tests });
  seen = undefined;
  await log(who, "features.save", `classes ${b.classes ?? "unchanged"}, online tests ${b.tests ?? "unchanged"}`);
}
