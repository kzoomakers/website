import type { PoolClient } from "pg";
import { conn } from "../db";
import { logAudit } from "../store";
import { notifyUser } from "../notifications";
import { describeQ, type Q } from "./questions";

// Certification: a member who passed the test waits in a trainer's queue; a trainer's sign-off is the only thing here that grants the tool authorization.
const fail = (m: string): never => { throw new Error(m); };
/** Who is acting. `id` is their member account (null for a Google-only admin, who can look but not sign off); `all` = whole-section or system write; `view` = may see every tool. */
export type Actor = { id: number | null; email: string; all: boolean; view: boolean };
const OPEN = ["passed", "in_training", "ready"];
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await conn()).connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
/** Tool ids this person may see, or null for all. */
async function visibleTools(c: { query: PoolClient["query"] }, a: Actor): Promise<number[] | null> {
  if (a.all || a.view) return null;
  return a.id ? (await c.query("SELECT tool_id FROM tool_trainers WHERE user_id = $1", [a.id])).rows.map((r) => r.tool_id) : [];
}
/** The one check for "may this person act on this tool": whole-section writers, or a trainer assigned to the tool. */
export async function canSignOff(a: Actor, toolId: number, c?: { query: PoolClient["query"] }) {
  if (a.all) return true;
  if (!a.id) return false;
  return ((await (c ?? (await conn())).query("SELECT 1 FROM tool_trainers WHERE tool_id = $1 AND user_id = $2", [toolId, a.id])).rowCount ?? 0) > 0;
}
/** Marks the person acting (by email) with their member id and whether they hold the whole section. */
export async function actorFor(email: string, all: boolean, view: boolean): Promise<Actor> {
  const id = (await (await conn()).query("SELECT id FROM site_users WHERE lower(email) = lower($1)", [email])).rows[0]?.id ?? null;
  return { id, email, all, view };
}

export async function queue(a: Actor) {
  const c = await conn(), tools = await visibleTools(c, a);
  if (tools && !tools.length) return { rows: [], trainer: false };
  const rows = (await c.query(`SELECT ce.id, ce.state, ce.created_at, ce.signoffs_required, u.id AS user_id, u.name, u.email, tl.id AS tool_id, tl.name AS tool, tl.category, at.pct::float AS pct, at.submitted_at,
      GREATEST(0, floor(extract(epoch FROM now() - ce.created_at) / 86400))::int AS waiting, ce.certified_at,
      (SELECT count(*)::int FROM cert_signoffs s WHERE s.cert_id = ce.id) AS signoffs,
      (SELECT string_agg(x.name, ', ' ORDER BY x.name) FROM tool_trainers tt JOIN site_users x ON x.id = tt.user_id WHERE tt.tool_id = ce.tool_id) AS trainers
    FROM certifications ce JOIN site_users u ON u.id = ce.user_id JOIN tools tl ON tl.id = ce.tool_id LEFT JOIN attempts at ON at.id = ce.attempt_id
    WHERE ($1::int[] IS NULL OR ce.tool_id = ANY($1)) AND (ce.state IN ('passed','in_training','ready') OR (ce.state = 'certified' AND ce.certified_at > now() - interval '90 days'))
    ORDER BY ce.created_at LIMIT 500`, [tools])).rows;
  return { rows, trainer: !!a.id };
}
/** How many are waiting for a first look, for the People badge. */
export async function waitingCount(a: Actor) {
  const c = await conn(), tools = await visibleTools(c, a);
  if (tools && !tools.length) return 0;
  return (await c.query("SELECT count(*)::int AS n FROM certifications WHERE state = 'passed' AND ($1::int[] IS NULL OR tool_id = ANY($1))", [tools])).rows[0].n as number;
}

export async function file(a: Actor, certId: unknown) {
  const c = await conn(), ce = (await c.query(`SELECT ce.id, ce.state, ce.user_id, ce.tool_id, ce.revision_id, ce.attempt_id, ce.signoffs_required, ce.created_at, ce.certified_at, ce.certified_by, u.name, u.email, tl.name AS tool, r.rev_no
    FROM certifications ce JOIN site_users u ON u.id = ce.user_id JOIN tools tl ON tl.id = ce.tool_id LEFT JOIN test_revisions r ON r.id = ce.revision_id WHERE ce.id = $1`, [Number.isInteger(certId) ? certId : 0])).rows[0];
  const vis = ce && (await visibleTools(c, a));
  if (!ce || (vis && !vis.includes(ce.tool_id))) return fail("not found");
  const att = ce.attempt_id ? (await c.query("SELECT pct::float AS pct, points::float AS points, max_points::float AS max, answers, per_question, submitted_at, started_at, passed FROM attempts WHERE id = $1", [ce.attempt_id])).rows[0] : null;
  const tried = (await c.query("SELECT count(*)::int AS n FROM attempts a JOIN test_revisions r ON r.id = a.revision_id JOIN test_tools tt ON tt.test_id = r.test_id WHERE a.user_id = $1 AND tt.tool_id = $2 AND NOT a.preview AND a.status IN ('submitted','expired')", [ce.user_id, ce.tool_id])).rows[0].n;
  const qs = new Map<number, Q & { id: number }>(att && ce.revision_id ? (await c.query("SELECT id, type, prompt_html, config FROM rev_questions WHERE revision_id = $1", [ce.revision_id])).rows.map((q) => [q.id, q]) : []);
  // The trainer sees the key; a member never does. `given` is the stored answer as-is (shortcut: raw JSON, not rendered per question type).
  const questions = att ? (att.per_question as { id: number; points: number; max: number; correct: boolean }[]).map((p) => ({ ...p, prompt_html: qs.get(p.id)?.prompt_html ?? "", key: qs.get(p.id) ? describeQ(qs.get(p.id)!) : "", given: att.answers?.[p.id] ?? null, critical: (qs.get(p.id) as any)?.required_correct === true })) : [];
  const events = (await c.query("SELECT id, at, actor, kind, note, shared, data FROM cert_events WHERE cert_id = $1 ORDER BY at, id", [ce.id])).rows;
  const signoffs = (await c.query("SELECT s.at, s.note, u.name FROM cert_signoffs s JOIN site_users u ON u.id = s.trainer_id WHERE s.cert_id = $1 ORDER BY s.at", [ce.id])).rows;
  return { cert: ce, attempt: att && { pct: att.pct, points: att.points, max: att.max, submitted_at: att.submitted_at, started_at: att.started_at }, tries: tried, questions, events, signoffs, can: await canSignOff(a, ce.tool_id, c) && !!a.id && a.id !== ce.user_id, self: a.id === ce.user_id };
}

/** Loads the certification locked for update and checks the actor may act on it. Nobody acts on their own: there is no admin bypass. */
async function lock(c: PoolClient, a: Actor, certId: unknown) {
  const ce = (await c.query("SELECT ce.*, tl.name AS tool, u.email AS member_email FROM certifications ce JOIN tools tl ON tl.id = ce.tool_id JOIN site_users u ON u.id = ce.user_id WHERE ce.id = $1 FOR UPDATE OF ce", [Number.isInteger(certId) ? certId : 0])).rows[0];
  if (!ce || !(await canSignOff(a, ce.tool_id, c))) return fail("not found");
  if (!a.id) return fail("Sign in with a member account to do this; it's recorded under your name.");
  if (a.id === ce.user_id) return fail("You can't review your own training.");
  return ce as { id: number; user_id: number; tool_id: number; state: string; signoffs_required: number; revision_id: number | null; tool: string; member_email: string };
}
const event = (c: PoolClient, certId: number, a: Actor, kind: string, note = "", shared = false, data?: unknown) =>
  c.query("INSERT INTO cert_events (cert_id, actor, kind, note, shared, data) VALUES ($1,$2,$3,$4,$5,$6)", [certId, a.email, kind, note, shared, data ? JSON.stringify(data) : null]);
const move = async (c: PoolClient, id: number, from: string[], to: string) => { if (!(await c.query("UPDATE certifications SET state = $3, updated_at = now() WHERE id = $1 AND state = ANY($2)", [id, from, to])).rowCount) fail("That's already been dealt with."); };

export async function startTraining(a: Actor, certId: unknown) {
  await tx(async (c) => { const ce = await lock(c, a, certId); await move(c, ce.id, ["passed"], "in_training"); await event(c, ce.id, a, "start", "Started hands-on training"); await logAudit(a.email, "training.cert.open", `${ce.member_email}: ${ce.tool}`); });
  return { ok: true };
}
export async function markReady(a: Actor, certId: unknown) {
  await tx(async (c) => { const ce = await lock(c, a, certId); await move(c, ce.id, ["in_training"], "ready"); await event(c, ce.id, a, "ready", "Ready for sign-off"); await logAudit(a.email, "training.cert.ready", `${ce.member_email}: ${ce.tool}`); });
  return { ok: true };
}
/** A dated note. `shared` lets the member read it. Notes are append-only: correct one with another. */
export async function addNote(a: Actor, certId: unknown, note: unknown, shared: unknown, session: unknown) {
  const n = clip(note, 2000);
  if (!n) fail("Write the note first.");
  await tx(async (c) => { const ce = await lock(c, a, certId); if (!OPEN.includes(ce.state)) fail("This one is closed."); await event(c, ce.id, a, session === true ? "training_session" : "note", n, shared === true); });
  return { ok: true };
}
export async function reject(a: Actor, certId: unknown, reason: unknown) {
  const why = clip(reason, 1000);
  if (why.length < 5) fail("Say why, so the member knows what to do next.");
  const who = await tx(async (c) => {
    const ce = await lock(c, a, certId); await move(c, ce.id, OPEN, "rejected"); await event(c, ce.id, a, "reject", why, true);
    await logAudit(a.email, "training.cert.reject", `${ce.member_email}: ${ce.tool}`); return ce;
  });
  await notifyUser(who.user_id, { kind: "training", title: `More work needed on ${who.tool}`, body: why, url: "/members/training" }).catch(() => {});
  return { ok: true };
}

/** The sign-off. Counts this trainer once; when enough have signed, the certification is done and the tool authorization is granted, all in one transaction. Notices go out after it commits. */
export async function signOff(a: Actor, certId: unknown, note: unknown) {
  const n = clip(note, 2000);
  if (n.length < 3) fail("A sign-off needs a note: what you did with them.");
  const out = await tx(async (c) => {
    const ce = await lock(c, a, certId);
    if (!OPEN.includes(ce.state)) return fail(ce.state === "certified" ? "Already certified." : "This one is closed.");
    if (!(await c.query("INSERT INTO cert_signoffs (cert_id, trainer_id, note) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [ce.id, a.id, n])).rowCount) fail("You've already signed this one off.");
    const have = (await c.query("SELECT count(*)::int AS n FROM cert_signoffs WHERE cert_id = $1", [ce.id])).rows[0].n;
    if (have < ce.signoffs_required) { await event(c, ce.id, a, "signoff", n, false, { have, need: ce.signoffs_required }); return { done: false, have, need: ce.signoffs_required, ce }; }
    const months = (await c.query("SELECT validity_months FROM tool_training WHERE tool_id = $1", [ce.tool_id])).rows[0]?.validity_months ?? null;
    await c.query("UPDATE certifications SET state = 'certified', certified_at = now(), certified_by = $2, valid_until = CASE WHEN $3::int IS NULL THEN NULL ELSE (now() AT TIME ZONE 'America/Detroit')::date + make_interval(months => $3::int)::interval END, updated_at = now() WHERE id = $1", [ce.id, a.email, months]);
    // Re-signing refreshes any earlier row (legacy or a previous cert) and clears a re-pass deadline.
    await c.query(`INSERT INTO tool_auths (user_id, tool_id, granted_by, granted_at, expires_on, note, source, cert_id, revision_id, retake_due_on)
      SELECT user_id, tool_id, $2, now(), valid_until, $3, 'training', id, revision_id, NULL FROM certifications WHERE id = $1
      ON CONFLICT (user_id, tool_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = now(), expires_on = EXCLUDED.expires_on, note = EXCLUDED.note, source = 'training', cert_id = EXCLUDED.cert_id, revision_id = EXCLUDED.revision_id, retake_due_on = NULL`, [ce.id, a.email, n.slice(0, 200)]);
    await event(c, ce.id, a, "certified", n, false, { have, need: ce.signoffs_required });
    await logAudit(a.email, "training.cert.signoff", `${ce.member_email}: ${ce.tool}`);
    await logAudit(a.email, "user.authorize", `${ce.member_email}: ${ce.tool}`); // the existing action, so older audit views still list the grant
    return { done: true, have, need: ce.signoffs_required, ce };
  });
  if (out.done) await notifyUser(out.ce.user_id, { kind: "training", title: `You're authorized on ${out.ce.tool}`, body: "A trainer signed you off.", url: "/members/training" }).catch(() => {});
  return { ok: true, certified: out.done, have: out.have, need: out.need };
}

// ---- trainers and per-tool settings --------------------------------------------------------------------------------------------------
export async function trainerMatrix() {
  const c = await conn();
  const tools = (await c.query(`SELECT t.id, t.name, t.category, COALESCE(tt.signoffs_required, 1) AS signoffs_required, tt.validity_months, COALESCE(tt.manual_grant_allowed, true) AS manual_grant_allowed,
      (SELECT count(*)::int FROM certifications ce WHERE ce.tool_id = t.id AND ce.state IN ('passed','in_training','ready')) AS awaiting, (SELECT count(*)::int FROM tool_auths_effective a WHERE a.tool_id = t.id AND NOT a.expired) AS certified,
      (SELECT json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY u.name) FROM tool_trainers x JOIN site_users u ON u.id = x.user_id WHERE x.tool_id = t.id) AS trainers,
      EXISTS (SELECT 1 FROM test_tools x JOIN tests s ON s.id = x.test_id JOIN test_revisions r ON r.test_id = s.id AND r.status = 'published' WHERE x.tool_id = t.id AND NOT s.archived) AS has_test
    FROM tools t LEFT JOIN tool_training tt ON tt.tool_id = t.id WHERE t.archived_at IS NULL ORDER BY lower(t.category), lower(t.name)`)).rows;
  return tools.map((t) => ({ ...t, trainers: t.trainers ?? [] }));
}
export async function findMembers(q: unknown) {
  const s = clip(q, 80);
  return s.length < 2 ? [] : (await (await conn()).query("SELECT id, name, email FROM site_users WHERE verified_at IS NOT NULL AND (name ILIKE $1 OR email ILIKE $1) ORDER BY name LIMIT 10", [`%${s.replace(/[%_\\]/g, "\\$&")}%`])).rows;
}
export async function setTrainer(toolId: unknown, userId: unknown, on: unknown, who: string) {
  const c = await conn(), r = (await c.query("SELECT t.name AS tool, u.email FROM tools t, site_users u WHERE t.id = $1 AND u.id = $2", [toolId, userId])).rows[0];
  if (!r) return fail("No such tool or member.");
  if (on === true) await c.query("INSERT INTO tool_trainers (tool_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [toolId, userId, who]);
  else await c.query("DELETE FROM tool_trainers WHERE tool_id = $1 AND user_id = $2", [toolId, userId]);
  await logAudit(who, "training.perm.change", `${r.email}: ${on === true ? "trainer for" : "no longer trainer for"} ${r.tool}`);
}
export async function saveToolTraining(toolId: unknown, b: any, who: string) {
  const need = Number.isInteger(b?.signoffs_required) ? b.signoffs_required : 1, months = b?.validity_months == null || b.validity_months === "" ? null : Number(b.validity_months);
  if (need < 1 || need > 5) fail("Sign-offs needed: 1 to 5.");
  if (months !== null && (!Number.isInteger(months) || months < 1 || months > 120)) fail("Valid for: 1 to 120 months, or blank for no expiry.");
  const c = await conn(), t = (await c.query("SELECT name FROM tools WHERE id = $1", [toolId])).rows[0];
  if (!t) fail("No such tool.");
  await c.query(`INSERT INTO tool_training (tool_id, signoffs_required, validity_months, manual_grant_allowed) VALUES ($1,$2,$3,$4)
    ON CONFLICT (tool_id) DO UPDATE SET signoffs_required = EXCLUDED.signoffs_required, validity_months = EXCLUDED.validity_months, manual_grant_allowed = EXCLUDED.manual_grant_allowed`, [toolId, need, months, b?.manual_grant_allowed !== false]);
  await logAudit(who, "training.settings", `${t.name}: ${need} sign-off(s), ${months ? months + " months" : "no expiry"}, manual grants ${b?.manual_grant_allowed !== false ? "allowed" : "off"}`);
}
