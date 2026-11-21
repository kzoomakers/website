import { db } from "./db";

// Courseware ships dark: each half has its own switch (settings key "learning"), off until an administrator turns it on.
export type LearnFlags = { library: boolean; courses: boolean };
let seen: { at: number; f: LearnFlags } | undefined;

/** Asked on every library page, so remembered for 5 seconds (another server may take that long to notice a change). */
export async function learnFlags(): Promise<LearnFlags> {
  if (seen && Date.now() - seen.at < 5_000) return seen.f;
  const d = db();
  const row = d ? (await d.ready, (await d.pool.query("SELECT data FROM settings WHERE key = 'learning'")).rows[0]?.data) : null;
  seen = { at: Date.now(), f: { library: row?.library === true, courses: row?.courses === true } };
  return seen.f;
}
export const libraryOn = async () => (await learnFlags()).library;

export async function saveLearnFlags(b: Partial<LearnFlags>) {
  const d = db();
  if (!d) throw new Error("No database.");
  await d.ready;
  const patch: Partial<LearnFlags> = {};
  if (typeof b.library === "boolean") patch.library = b.library;
  if (typeof b.courses === "boolean") patch.courses = b.courses;
  await d.pool.query("INSERT INTO settings (key, data) VALUES ('learning', $1) ON CONFLICT (key) DO UPDATE SET data = settings.data || EXCLUDED.data", [JSON.stringify(patch)]);
  seen = undefined;
}
