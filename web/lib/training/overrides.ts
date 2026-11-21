import type { PoolClient } from "pg";
import { conn } from "../db";
import { logAudit } from "../store";
import type { Actor } from "./certs";
import { emit, emitLeads } from "./notify";

// Manual advance. Each action needs a reason, leaves an "override" row in the member's file and the audit log, tells the leads, and can't be pointed at yourself (no admin bypass).
// The caller (the RPC route) has already checked the "training.override" special permission.
const fail = (m: string): never => { throw new Error(m); };
const TODAY = "(now() AT TIME ZONE 'America/Detroit')::date";
export const HOWS = { waive_test: "Waive the test", skip_training: "Skip training, go to sign-off", certify_now: "Certify now", credit_prior: "Credit a prior certification", revoke: "Revoke", void_attempt: "Void a test attempt" } as const;

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await conn()).connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
const ev = (c: PoolClient, cert: number, who: string, how: string, why: string) => c.query("INSERT INTO cert_events (cert_id, actor, kind, note, data) VALUES ($1,$2,'override',$3,$4)", [cert, who, why, JSON.stringify({ how })]);

export async function override(a: Actor, b: { how?: unknown; user?: unknown; tool?: unknown; reason?: unknown; date?: unknown; attempt?: unknown }) {
  const how = String(b.how), why = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : "";
  if (!Object.hasOwn(HOWS, how)) fail("Choose what to do.");
  if (why.length < 10) fail("Give a reason of at least a sentence; it goes in the member's file and the audit log.");
  if (!a.id) fail("Sign in with a member account to do this; it's recorded under your name.");
  const c0 = await conn();
  let user = Number.isInteger(b.user) ? (b.user as number) : 0;
  if (how === "void_attempt") user = (await c0.query("SELECT user_id FROM attempts WHERE id = $1", [Number.isInteger(b.attempt) ? b.attempt : 0])).rows[0]?.user_id ?? fail("No such attempt.");
  if (user === a.id) fail("You can't override your own training.");
  const tool = Number.isInteger(b.tool) ? (b.tool as number) : 0;
  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;

  const r = await tx(async (c) => {
    const m = (await c.query("SELECT u.name, u.email, t.name AS tool FROM site_users u, tools t WHERE u.id = $1 AND t.id = $2", [user, tool])).rows[0];
    if (!m && how !== "void_attempt") return fail("No such member or tool.");
    if (how === "void_attempt") {
      if (!(await c.query("UPDATE attempts SET status = 'void', voided_by = $2, voided_reason = $3 WHERE id = $1 AND status IN ('submitted','expired')", [b.attempt, a.email, why])).rowCount) fail("Only a finished attempt can be voided.");
      await logAudit(a.email, "training.attempt.void", `attempt #${b.attempt}: ${why}`);
      return null;
    }
    // The member's open certification, if any, is locked so two overrides can't race.
    let ce = (await c.query("SELECT id, state FROM certifications WHERE user_id = $1 AND tool_id = $2 AND state IN ('passed','in_training','ready') FOR UPDATE", [user, tool])).rows[0];
    const months = (await c.query("SELECT validity_months, signoffs_required FROM tool_training WHERE tool_id = $1", [tool])).rows[0];
    const fresh = async (state: string) => (await c.query("INSERT INTO certifications (user_id, tool_id, state, source, signoffs_required) VALUES ($1,$2,$3,'override',$4) RETURNING id", [user, tool, state, months?.signoffs_required ?? 1])).rows[0];
    if (how === "waive_test") { if (ce) fail("They already have training in progress for this tool."); ce = await fresh("passed"); }
    else if (how === "skip_training") {
      if (!ce) fail("They have no training in progress for this tool.");
      await c.query("UPDATE certifications SET state = 'ready', updated_at = now() WHERE id = $1", [ce.id]);
    } else if (how === "revoke") {
      const done = (await c.query("UPDATE certifications SET state = 'revoked', updated_at = now() WHERE id = (SELECT id FROM certifications WHERE user_id = $1 AND tool_id = $2 AND state = 'certified' ORDER BY certified_at DESC NULLS LAST LIMIT 1) RETURNING id", [user, tool])).rows[0];
      const had = (await c.query("DELETE FROM tool_auths WHERE user_id = $1 AND tool_id = $2", [user, tool])).rowCount;
      if (!done && !had) fail("They don't hold this authorization.");
      ce = done ?? (await fresh("revoked")); // a legacy authorization has no certification yet: make one so the file shows the revoke
    } else { // certify_now, credit_prior
      if (how === "credit_prior" && (!date || date > (await c.query(`SELECT ${TODAY}::text AS d`)).rows[0].d)) fail("Give the date they were certified (not in the future).");
      if (!ce) ce = await fresh("certified");
      await c.query(`UPDATE certifications SET state = 'certified', source = 'override', certified_at = CASE WHEN $2::date IS NULL THEN now() ELSE ($2::date + time '12:00') AT TIME ZONE 'America/Detroit' END, certified_by = $3, updated_at = now(),
        valid_until = CASE WHEN $4::int IS NULL THEN NULL ELSE COALESCE($2::date, ${TODAY}) + make_interval(months => $4::int) END WHERE id = $1`, [ce.id, how === "credit_prior" ? date : null, a.email, months?.validity_months ?? null]);
      await c.query(`INSERT INTO tool_auths (user_id, tool_id, granted_by, granted_at, expires_on, note, source, cert_id, retake_due_on)
        SELECT user_id, tool_id, $2, COALESCE(certified_at, now()), valid_until, $3, 'override', id, NULL FROM certifications WHERE id = $1
        ON CONFLICT (user_id, tool_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = EXCLUDED.granted_at, expires_on = EXCLUDED.expires_on, note = EXCLUDED.note, source = 'override', cert_id = EXCLUDED.cert_id, retake_due_on = NULL`, [ce.id, a.email, why.slice(0, 200)]);
    }
    await ev(c, ce.id, a.email, how, why);
    await logAudit(a.email, "training.cert.override", `${m.email}: ${m.tool}: ${HOWS[how as keyof typeof HOWS]}: ${why}`);
    if (how === "certify_now" || how === "credit_prior") await logAudit(a.email, "user.authorize", `${m.email}: ${m.tool}`);
    return { ...m, cert: ce.id };
  });
  if (r) {
    await emit(how === "revoke" ? "cert.revoked" : "cert.override", { userId: user, ref: r.cert, vars: { tool: r.tool, reason: why } });
    await emitLeads("lead.override", `${how}:${r.cert}`, { name: r.name, tool: r.tool, trainer: a.email, reason: `${HOWS[how as keyof typeof HOWS]}. ${why}` });
  }
  return { ok: true };
}
