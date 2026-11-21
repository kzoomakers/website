import type { PoolClient } from "pg";
import { conn } from "../db";
import { logAudit } from "../store";
import type { Actor } from "./certs";
import { emit, emitLeads } from "./notify";
import { trainingCfg, trainingEnabled } from "./settings";

// Re-pass after a major revision. A rollout puts current holders of the tool on a deadline (tool_auths.retake_due_on). Passing the new revision satisfies it;
// missing the deadline lapses it. The authorization row is kept either way: tool_auths_effective already reads it as expired once the date passes.
const fail = (m: string): never => { throw new Error(m); };
type Q = { query: PoolClient["query"] };
const SOURCES = ["training", "legacy", "manual", "override"];
const TODAY = "(now() AT TIME ZONE 'America/Detroit')::date"; // the shop's calendar day, not the database server's
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
/** The smallest reminder step that is still at least `days` away: the one a member with that many days left is inside. */
const step = (days: number, cadence: number[]) => cadence.filter((n) => n >= days).sort((a, b) => a - b)[0] ?? null;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(+new Date(v));

/** Live authorizations on a test's tools, grouped by where they came from: who a major revision would put on the clock. */
export async function preview(testId: unknown) {
  const rows = (await (await conn()).query(`SELECT a.source, count(*)::int AS n FROM tool_auths_effective a JOIN test_tools tt ON tt.tool_id = a.tool_id WHERE tt.test_id = $1 AND NOT a.expired GROUP BY a.source`, [Number.isInteger(testId) ? testId : 0])).rows;
  return Object.fromEntries(SOURCES.map((s) => [s, rows.find((r) => r.source === s)?.n ?? 0]));
}

/** Inside the publish transaction. `sources` says which holders are included (default: only those signed off through training; legacy and hand-granted people only when the lead ticks them). */
export async function createRollout(c: PoolClient, revId: number, testId: number, deadline: string, sources: unknown, who: string, note: string) {
  if (!isDate(deadline)) fail("Give the re-pass deadline as a date.");
  const ok = (await c.query(`SELECT ($1::date > ${TODAY} AND $1::date <= ${TODAY} + 365) AS ok`, [deadline])).rows[0].ok;
  if (!ok) fail("The re-pass deadline must be in the future, within a year.");
  const days = (await c.query(`SELECT ($1::date - ${TODAY}) AS d`, [deadline])).rows[0].d as number, cadence = (await trainingCfg()).reminder_days; // the start notice covers the step we're already in
  const inc = Array.isArray(sources) ? sources.filter((s) => SOURCES.includes(s)) : ["training"];
  const ro = (await c.query("INSERT INTO rollouts (revision_id, deadline, created_by, note) VALUES ($1,$2,$3,$4) RETURNING id", [revId, deadline, who, note])).rows[0].id as number;
  const hit = (await c.query(`SELECT a.user_id, a.tool_id FROM tool_auths_effective a JOIN test_tools tt ON tt.tool_id = a.tool_id WHERE tt.test_id = $1 AND NOT a.expired AND a.source = ANY($2)`, [testId, inc])).rows;
  for (const h of hit) {
    // A second major revision supersedes the first: its pending rows step aside and the new deadline replaces the old.
    await c.query("UPDATE rollout_members SET status = 'exempt' WHERE user_id = $1 AND tool_id = $2 AND status IN ('pending','lapsed') AND rollout_id <> $3", [h.user_id, h.tool_id, ro]);
    await c.query("INSERT INTO rollout_members (rollout_id, user_id, tool_id, last_reminder_days) VALUES ($1,$2,$3, $4)", [ro, h.user_id, h.tool_id, step(days, cadence)]);
    await c.query("UPDATE tool_auths SET retake_due_on = $3 WHERE user_id = $1 AND tool_id = $2", [h.user_id, h.tool_id, deadline]);
  }
  const names = new Map((await c.query("SELECT id, name FROM tools WHERE id = ANY($1)", [hit.map((h) => h.tool_id)])).rows.map((t) => [t.id, t.name as string]));
  return { id: ro, deadline, members: hit.length, userIds: hit.map((h) => ({ user: h.user_id as number, tool: names.get(h.tool_id) ?? "a tool" })) };
}
export const tellRollout = (r: { id: number; deadline: string; userIds: { user: number; tool: string }[] }, note: string) =>
  Promise.all(r.userIds.map((x) => emit("rollout.started", { userId: x.user, ref: `${r.id}:${x.tool}`, vars: { tool: x.tool, deadline: r.deadline, reason: note || "see the Training page" } })));

/** A member passed the published revision. If they owed a re-pass on this tool, settle it: clear the deadline, restore a lapsed authorization, no new sign-off. Returns whether it did. */
export async function satisfyRollout(c: Q, userId: number, toolId: number, revId: number) {
  const hit = (await c.query(`UPDATE rollout_members rm SET status = 'satisfied' FROM rollouts r WHERE rm.rollout_id = r.id AND r.undone_at IS NULL AND r.revision_id <= $3 AND rm.user_id = $1 AND rm.tool_id = $2 AND rm.status IN ('pending','lapsed') RETURNING rm.rollout_id`, [userId, toolId, revId])).rowCount;
  if (!hit) return false;
  const months = (await c.query("SELECT validity_months FROM tool_training WHERE tool_id = $1", [toolId])).rows[0]?.validity_months ?? null;
  const a = (await c.query(`UPDATE tool_auths SET retake_due_on = NULL, revision_id = $3,
      expires_on = CASE WHEN $4::int IS NOT NULL THEN ${TODAY} + make_interval(months => $4::int) WHEN expires_on < ${TODAY} THEN NULL ELSE expires_on END
    WHERE user_id = $1 AND tool_id = $2 RETURNING cert_id`, [userId, toolId, revId, months])).rows[0];
  if (a?.cert_id) {
    await c.query("UPDATE certifications SET state = 'certified', updated_at = now() WHERE id = $1 AND state = 'lapsed'", [a.cert_id]);
    await c.query("INSERT INTO cert_events (cert_id, actor, kind, note) VALUES ($1,'system','repass','Passed the revised test')", [a.cert_id]);
  }
  return true;
}

/** Countdown notices: once per step of the cadence (default 14, 7, 3, 1 days and the day itself), never twice, never after someone has passed. */
export async function sendReminders() {
  if (!(await trainingEnabled())) return 0; // Training switched off: the clock pauses (see lapseSweep)
  const c = await conn(), cadence = (await trainingCfg()).reminder_days;
  let n = 0;
  for (const m of (await c.query(`SELECT m.rollout_id, m.user_id, m.tool_id, m.last_reminder_days AS last, to_char(r.deadline,'YYYY-MM-DD') AS deadline, (r.deadline - ${TODAY}) AS days, tl.name AS tool
    FROM rollout_members m JOIN rollouts r ON r.id = m.rollout_id JOIN tools tl ON tl.id = m.tool_id WHERE m.status = 'pending' AND r.undone_at IS NULL AND r.deadline >= ${TODAY}`)).rows) {
    const s = step(m.days, cadence);
    if (s === null || (m.last !== null && m.last <= s)) continue;
    if (!(await c.query("UPDATE rollout_members SET last_reminder_days = $4, notified_at = now() WHERE rollout_id = $1 AND user_id = $2 AND tool_id = $3 AND (last_reminder_days IS NULL OR last_reminder_days > $4)", [m.rollout_id, m.user_id, m.tool_id, s])).rowCount) continue;
    await emit("rollout.reminder", { userId: m.user_id, ref: `${m.rollout_id}:${m.tool_id}:${s}`, vars: { tool: m.tool, deadline: m.deadline, days: m.days === 0 ? "today is the last day" : `${m.days} day${m.days === 1 ? "" : "s"}` } });
    n++;
  }
  await c.query("DELETE FROM training_mail_log WHERE at < now() - interval '2 days'"); // the day is part of every key, so older rows can't matter
  return n;
}

/** Marks overdue, unsatisfied members lapsed. A rollout that would lapse over half its people waits for a lead (rollouts.lapse_ok). Returns how many lapsed. */
export async function lapseSweep(guardPct = 50) {
  if (!(await trainingEnabled())) return 0; // switched off means paused: nobody loses an authorization they can't be told about or fix
  const c = await conn();
  let n = 0;
  for (const ro of (await c.query(`SELECT id, to_char(deadline,'YYYY-MM-DD') AS deadline, lapse_ok, guard_at,
      (SELECT count(*)::int FROM rollout_members m WHERE m.rollout_id = r.id AND m.status = 'pending') AS pending, (SELECT count(*)::int FROM rollout_members m WHERE m.rollout_id = r.id AND m.status <> 'exempt') AS total
    FROM rollouts r WHERE undone_at IS NULL AND deadline < ${TODAY}`)).rows) {
    if (!ro.pending) continue;
    if (!ro.lapse_ok && ro.total >= 4 && ro.pending * 100 > ro.total * guardPct) {
      if (!ro.guard_at) { await c.query("UPDATE rollouts SET guard_at = now() WHERE id = $1", [ro.id]); await logAudit("system", "training.rollout.guard", `Rollout #${ro.id}: ${ro.pending} of ${ro.total} would lapse, waiting for a lead to confirm`); }
      continue;
    }
    const who = (await c.query(`UPDATE rollout_members SET status = 'lapsed' WHERE rollout_id = $1 AND status = 'pending' RETURNING user_id, tool_id`, [ro.id])).rows;
    for (const w of who) {
      const a = (await c.query("SELECT cert_id FROM tool_auths WHERE user_id = $1 AND tool_id = $2", [w.user_id, w.tool_id])).rows[0];
      if (a?.cert_id && (await c.query("UPDATE certifications SET state = 'lapsed', updated_at = now() WHERE id = $1 AND state = 'certified'", [a.cert_id])).rowCount) await c.query("INSERT INTO cert_events (cert_id, actor, kind, note) VALUES ($1,'system','lapsed','Did not re-pass by the deadline')", [a.cert_id]);
      const t = (await c.query("SELECT name FROM tools WHERE id = $1", [w.tool_id])).rows[0]?.name ?? "a tool";
      await emit("cert.lapsed", { userId: w.user_id, ref: `${ro.id}:${w.tool_id}`, vars: { tool: t, deadline: ro.deadline } });
    }
    n += who.length;
    await logAudit("system", "training.rollout.lapse", `Rollout #${ro.id}: ${who.length} lapsed`);
  }
  return n;
}

// ---- lead controls --------------------------------------------------------------------------------------------------------------------
export const rollouts = async () => (await (await conn()).query(`SELECT r.id, to_char(r.deadline,'YYYY-MM-DD') AS deadline, r.created_by, r.created_at, r.undone_at, r.lapse_ok, r.guard_at, r.note, tv.rev_no, t.title, string_agg(DISTINCT tl.name, ', ') AS tool,
    count(m.*) FILTER (WHERE m.status = 'pending')::int AS pending, count(m.*) FILTER (WHERE m.status = 'satisfied')::int AS satisfied, count(m.*) FILTER (WHERE m.status = 'lapsed')::int AS lapsed, count(m.*) FILTER (WHERE m.status = 'exempt')::int AS exempt
  FROM rollouts r JOIN test_revisions tv ON tv.id = r.revision_id JOIN tests t ON t.id = tv.test_id LEFT JOIN rollout_members m ON m.rollout_id = r.id LEFT JOIN tools tl ON tl.id = m.tool_id GROUP BY r.id, tv.rev_no, t.title ORDER BY r.id DESC LIMIT 50`)).rows;
export const rolloutMembers = async (id: unknown) => (await (await conn()).query(`SELECT m.user_id, m.tool_id, m.status, u.name, u.email, tl.name AS tool FROM rollout_members m JOIN site_users u ON u.id = m.user_id JOIN tools tl ON tl.id = m.tool_id WHERE m.rollout_id = $1 ORDER BY m.status, lower(u.name)`, [Number.isInteger(id) ? id : 0])).rows;

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await conn()).connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
const live = async (c: PoolClient, id: unknown) => (await c.query("SELECT id FROM rollouts WHERE id = $1 AND undone_at IS NULL FOR UPDATE", [Number.isInteger(id) ? id : 0])).rows[0] ?? fail("That rollout isn't active.");
/** Restores lapsed people (authorization row and certification) for the given members, and sets their deadline. `date` null clears it. */
async function restore(c: PoolClient, id: number, date: string | null, only?: { user: number; tool: number }) {
  const rows = (await c.query(`UPDATE rollout_members SET status = CASE WHEN $2::date IS NULL THEN status ELSE 'pending' END WHERE rollout_id = $1 AND status IN ('pending','lapsed') AND ($3::int IS NULL OR (user_id = $3 AND tool_id = $4)) RETURNING user_id, tool_id`, [id, date, only?.user ?? null, only?.tool ?? null])).rows;
  for (const w of rows) {
    await c.query("UPDATE tool_auths SET retake_due_on = $3 WHERE user_id = $1 AND tool_id = $2", [w.user_id, w.tool_id, date]);
    await c.query("UPDATE certifications SET state = 'certified', updated_at = now() WHERE state = 'lapsed' AND id = (SELECT cert_id FROM tool_auths WHERE user_id = $1 AND tool_id = $2)", [w.user_id, w.tool_id]);
  }
  return rows.length;
}
/** Moves the deadline for everyone still owing a re-pass, including people who already lapsed. */
export async function extendRollout(id: unknown, deadline: unknown, who: string) {
  if (!isDate(deadline)) fail("Give the new deadline as a date.");
  const n = await tx(async (c) => {
    await live(c, id);
    if (!(await c.query(`SELECT 1 WHERE $1::date > ${TODAY} AND $1::date <= ${TODAY} + 365`, [deadline])).rowCount) fail("The new deadline must be in the future, within a year.");
    await c.query("UPDATE rollouts SET deadline = $2, guard_at = NULL WHERE id = $1", [id, deadline]);
    return restore(c, id as number, deadline as string);
  });
  await logAudit(who, "training.rollout.extend", `Rollout #${id}: deadline ${deadline}, ${n} member(s)`);
}
/** The escape hatch for "we marked it major by mistake": nobody owes a re-pass, lapsed people are restored. */
export async function undoRollout(id: unknown, who: string) {
  const n = await tx(async (c) => { await live(c, id); const k = await restore(c, id as number, null); await c.query("UPDATE rollouts SET undone_at = now() WHERE id = $1", [id]); return k; });
  await logAudit(who, "training.rollout.undo", `Rollout #${id}: ${n} member(s) cleared`);
}
/** A lead says yes, this many lapses is intended. */
export async function confirmLapse(id: unknown, who: string) {
  await tx(async (c) => { await live(c, id); await c.query("UPDATE rollouts SET lapse_ok = true WHERE id = $1", [id]); });
  await logAudit(who, "training.rollout.confirm", `Rollout #${id}: large lapse confirmed`);
}
/** Gives one member more time, or (exempt) lets them off. Both need a reason and leave a note on their certification. Refuses self-override (no admin bypass). */
export async function memberOverride(id: unknown, user: unknown, tool: unknown, how: unknown, date: unknown, reason: unknown, actor: string | Actor) {
  const who = typeof actor === "string" ? actor : actor.email;
  const why = clip(reason, 500);
  if (why.length < 5) fail("Give a reason.");
  const u = Number.isInteger(user) ? (user as number) : 0, t = Number.isInteger(tool) ? (tool as number) : 0;
  if (typeof actor !== "string") {
    if (!actor.id) fail("Sign in with a member account to do this; it's recorded under your name.");
    if (u === actor.id) fail("You can't override your own training.");
  }
  await tx(async (c) => {
    await live(c, id);
    if (how === "exempt") {
      if (!(await c.query("UPDATE rollout_members SET status = 'exempt' WHERE rollout_id = $1 AND user_id = $2 AND tool_id = $3 AND status IN ('pending','lapsed')", [id, u, t])).rowCount) fail("That member isn't waiting on this rollout.");
      await c.query("UPDATE tool_auths SET retake_due_on = NULL WHERE user_id = $1 AND tool_id = $2", [u, t]);
      await c.query("UPDATE certifications SET state = 'certified', updated_at = now() WHERE state = 'lapsed' AND id = (SELECT cert_id FROM tool_auths WHERE user_id = $1 AND tool_id = $2)", [u, t]);
    } else {
      if (!isDate(date) || !(await c.query(`SELECT 1 WHERE $1::date > ${TODAY}`, [date])).rowCount) fail("Give a future date.");
      if (!(await restore(c, id as number, date as string, { user: u, tool: t }))) fail("That member isn't waiting on this rollout.");
    }
    const cert = (await c.query("SELECT cert_id FROM tool_auths WHERE user_id = $1 AND tool_id = $2", [u, t])).rows[0]?.cert_id;
    if (cert) await c.query("INSERT INTO cert_events (cert_id, actor, kind, note) VALUES ($1,$2,$3,$4)", [cert, who, how === "exempt" ? "rollout.exempt" : "rollout.extend", why]);
  });
  if (how === "exempt") {
    const x = (await (await conn()).query("SELECT u.name, t.name AS tool FROM site_users u, tools t WHERE u.id = $1 AND t.id = $2", [u, t])).rows[0];
    if (x) { await emit("cert.override", { userId: u, ref: `${id}:${t}`, vars: { tool: x.tool, reason: why } }); await emitLeads("lead.override", `${id}:${u}:${t}`, { name: x.name, tool: x.tool, trainer: who, reason: why }); }
  }
  await logAudit(who, how === "exempt" ? "training.cert.override" : "training.rollout.extend", `Rollout #${id}: member #${u} ${how === "exempt" ? "exempted" : "extended to " + date}: ${why}`);
}
