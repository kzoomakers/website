import { conn } from "./db";
import { logAudit } from "./store";

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// Tools (machines that need a sign-off) and who is authorized on them. Moved out of crm.ts; crm.ts re-exports it.
// "Authorized" is answered here and only here: training (lib/training) writes tool_auths through grantAuth/grantFromCert, never around it.
export type Tool = { id: number; name: string; category: string; description: string };
export const listTools = async () => (await (await conn()).query("SELECT t.id, t.name, t.category, t.description, count(a.user_id)::int AS authorized FROM tools t LEFT JOIN tool_auths a ON a.tool_id = t.id GROUP BY t.id ORDER BY lower(t.category), lower(t.name)")).rows;
export async function saveTool(b: any) {
  const name = clip(b?.name, 80);
  if (!name) throw new Error("A tool needs a name.");
  const v = [name, clip(b?.category, 60), clip(b?.description, 500)], c = await conn();
  try {
    if (Number.isInteger(b?.id)) await c.query("UPDATE tools SET name=$2, category=$3, description=$4 WHERE id = $1", [b.id, ...v]);
    else await c.query("INSERT INTO tools (name, category, description) VALUES ($1,$2,$3)", v);
  } catch (e: any) { throw new Error(e.code === "23505" ? "A tool with that name already exists." : e.message); }
}
export async function deleteTool(id: number) {
  const c = await conn();
  // Training records are history (who was certified on what, and why): deleting the tool would erase them. Remove its tests and certifications first, deliberately.
  if ((await c.query("SELECT 1 FROM test_tools WHERE tool_id = $1 UNION ALL SELECT 1 FROM certifications WHERE tool_id = $1 LIMIT 1", [id])).rowCount)
    throw new Error("This tool has training tests or certification records, so it can't be deleted.");
  await c.query("DELETE FROM tools WHERE id = $1", [id]);
}

export type Auth = { tool_id: number; name: string; category: string; granted_by: string; granted_at: string; expires_on: string | null; note: string; expired: boolean; source: string; retake_due_on: string | null; cert_id: number | null };
// `expired` and the effective expiry come from the tool_auths_effective view (db schema): the earlier of expires_on and a re-pass deadline, in the shop's time zone.
export const authsFor = async (userId: number): Promise<Auth[]> =>
  (await (await conn()).query(`SELECT a.tool_id, t.name, t.category, a.granted_by, a.granted_at, to_char(a.expires_on, 'YYYY-MM-DD') AS expires_on, to_char(a.retake_due_on, 'YYYY-MM-DD') AS retake_due_on, a.note, a.source, a.expired, a.cert_id
    FROM tool_auths_effective a JOIN tools t ON t.id = a.tool_id WHERE a.user_id = $1 ORDER BY lower(t.category), lower(t.name)`, [userId])).rows;
/** A person-to-person grant (the Grant button). A re-grant replaces whatever was there, including a training record and a re-pass deadline: a human decided. */
export async function grantAuth(userId: number, toolId: number, expires: unknown, note: unknown, who: string) {
  const exp = typeof expires === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null, c = await conn();
  const t = (await c.query("SELECT name FROM tools WHERE id = $1", [toolId])).rows[0], u = (await c.query("SELECT email FROM site_users WHERE id = $1", [userId])).rows[0];
  if (!t || !u) throw new Error("No such tool or member.");
  if ((await c.query("SELECT 1 FROM tool_training WHERE tool_id = $1 AND NOT manual_grant_allowed", [toolId])).rowCount) throw new Error("This tool is signed off through training. Use the Training queue.");
  await c.query(`INSERT INTO tool_auths (user_id, tool_id, granted_by, granted_at, expires_on, note, source) VALUES ($1,$2,$3, now(), $4, $5, 'manual')
    ON CONFLICT (user_id, tool_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = now(), expires_on = EXCLUDED.expires_on, note = EXCLUDED.note, source = 'manual', cert_id = NULL, revision_id = NULL, retake_due_on = NULL`, [userId, toolId, who, exp, clip(note, 200)]);
  await logAudit(who, "user.authorize", `${u.email}: ${t.name}${exp ? " until " + exp : ""}`);
}
export async function revokeAuth(userId: number, toolId: number, who: string) {
  const r = (await (await conn()).query("DELETE FROM tool_auths a USING tools t, site_users u WHERE a.user_id = $1 AND a.tool_id = $2 AND t.id = a.tool_id AND u.id = a.user_id RETURNING t.name, u.email", [userId, toolId])).rows[0];
  if (r) await logAudit(who, "user.deauthorize", `${r.email}: ${r.name}`);
}
