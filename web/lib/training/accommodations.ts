import { conn } from "../db";
import { logAudit } from "../store";
import type { Actor } from "./certs";

// Extra time and read-aloud for one member, set by a trainer. The attempt copies these when it starts, so a later change never rewrites a finished attempt.
const fail = (m: string): never => { throw new Error(m); };
export const MULTIPLIERS = [1, 1.25, 1.5, 2];
export type Accommodation = { time_multiplier: number; read_aloud: boolean; has_notes: boolean; set_by: string; set_at: Date | null };
const NONE: Accommodation = { time_multiplier: 1, read_aloud: false, has_notes: false, set_by: "", set_at: null };

export async function getAccommodation(userId: number): Promise<Accommodation> {
  const r = (await (await conn()).query("SELECT time_multiplier::float AS time_multiplier, read_aloud, notes <> '' AS has_notes, set_by, set_at FROM training_accommodations WHERE user_id = $1", [userId])).rows[0];
  return r ?? NONE;
}

// shortcut: notes are write-only here (health-adjacent, so reading them goes through the logged Training record); a blank note keeps the old one. Upgrade if trainers need to read or clear them.
/** Trainers (any tool) and whole-section writers only. Nobody sets their own. Recorded in the audit log. */
export async function setAccommodation(a: Actor, userId: unknown, s: { time_multiplier?: unknown; read_aloud?: unknown; notes?: unknown }) {
  if (!Number.isInteger(userId)) fail("No such member.");
  if (!a.id) fail("Sign in with a member account to do this; it's recorded under your name.");
  if (a.id === userId) fail("You can't set your own accommodations.");
  const c = await conn();
  if (!a.all && !(await c.query("SELECT 1 FROM tool_trainers WHERE user_id = $1 LIMIT 1", [a.id])).rowCount) fail("Only trainers can set accommodations.");
  const m = Number(s.time_multiplier);
  if (!MULTIPLIERS.includes(m)) fail("Choose an extra-time setting from the list.");
  const who = (await c.query("SELECT email FROM site_users WHERE id = $1", [userId])).rows[0];
  if (!who) fail("No such member.");
  const notes = typeof s.notes === "string" ? s.notes.trim().slice(0, 500) : "", ra = s.read_aloud === true;
  await c.query(`INSERT INTO training_accommodations (user_id, time_multiplier, read_aloud, notes, set_by, set_at) VALUES ($1,$2,$3,$4,$5, now())
    ON CONFLICT (user_id) DO UPDATE SET time_multiplier = EXCLUDED.time_multiplier, read_aloud = EXCLUDED.read_aloud, notes = CASE WHEN EXCLUDED.notes = '' THEN training_accommodations.notes ELSE EXCLUDED.notes END, set_by = EXCLUDED.set_by, set_at = now()`, [userId, m, ra, notes, a.email]);
  await logAudit(a.email, "training.accommodation.set", `${who.email}: extra time ×${m}${ra ? ", read-aloud allowed" : ""}`);
  return { ok: true };
}
