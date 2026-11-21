import type { PoolClient } from "pg";
import { conn } from "../db";
import { drawQuestions, memberQuestion, scoreQuestions, describeQ, type Q } from "./questions";
import { trainingEnabled } from "./settings";
import { satisfyRollout } from "./recert";
import { emit } from "./notify";

// A member taking a test. The server owns the clock, the draw and the grade; the browser only ever gets member-view questions (no key) and sends answers.
const GRACE_MS = 30_000, MAX_ANSWERS_BYTES = 60_000;
const fail = (m: string): never => { throw new Error(m); };
type Row = { id: number; user_id: number; revision_id: number; status: string; seed: number; due_at: Date | null; answers: Record<string, unknown>; seq: number };
type Rev = { id: number; test_id: number; pass_pct: number; time_limit_min: number | null; max_attempts: number | null; cooldown_hours: number; shuffle_questions: boolean; shuffle_choices: boolean; pool_size: number | null; review_mode: string; intro_html: string };
const REV = "r.id, r.test_id, r.pass_pct, r.time_limit_min, r.max_attempts, r.cooldown_hours, r.shuffle_questions, r.shuffle_choices, r.pool_size, r.review_mode, r.intro_html";
const QCOLS = "id, qkey, position, type, prompt_html, points::float AS points, config, feedback_html, required_correct";

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await conn()).connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
const questionsOf = async (c: { query: PoolClient["query"] }, revId: number) => (await c.query(`SELECT ${QCOLS} FROM rev_questions WHERE revision_id = $1 ORDER BY position, id`, [revId])).rows as (Q & { id: number; qkey: string })[];
const drawn = (qs: (Q & { id: number })[], r: Rev, seed: number) => drawQuestions(qs, seed, r.pool_size, r.shuffle_questions);

/** What the member's screen needs to take (or resume) an attempt: member-view questions only. */
async function view(c: PoolClient | { query: PoolClient["query"] }, a: Row, r: Rev) {
  const qs = drawn(await questionsOf(c, a.revision_id), r, a.seed);
  return { attemptId: a.id, intro_html: r.intro_html, due_at: a.due_at, seq: a.seq, answers: a.answers, questions: qs.map((q) => memberQuestion(q, a.seed, r.shuffle_choices)) };
}

/** Starts an attempt on the test's published revision, or resumes the one already open (two tabs, two starts: the second resumes the first). */
export async function start(userId: number, testId: unknown) {
  if (!(await trainingEnabled())) fail("Training isn't open yet.");
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`train:${userId}`]); // one start at a time per member
    const r = (await c.query(`SELECT ${REV} FROM test_revisions r JOIN tests t ON t.id = r.test_id WHERE r.test_id = $1 AND r.status = 'published' AND NOT t.archived`, [Number.isInteger(testId) ? testId : 0])).rows[0] as Rev | undefined;
    if (!r) return fail("There's no test to take right now.");
    const open = (await c.query("SELECT id, user_id, revision_id, status, seed, due_at, answers, seq FROM attempts WHERE user_id = $1 AND revision_id = $2 AND status = 'in_progress' AND NOT preview", [userId, r.id])).rows[0] as Row | undefined;
    if (open && (!open.due_at || open.due_at.getTime() + GRACE_MS > Date.now())) return view(c, open, r);
    if (open) await settle(c, open, r, null); // ran out of time while away: grade what was saved, then carry on with the checks below
    const done = (await c.query("SELECT count(*)::int AS n, max(submitted_at) AS last FROM attempts WHERE user_id = $1 AND revision_id = $2 AND NOT preview AND status IN ('submitted','expired')", [userId, r.id])).rows[0];
    if (r.max_attempts && done.n >= r.max_attempts) fail("You've used all your attempts. Ask a trainer.");
    if (done.last && r.cooldown_hours && new Date(done.last).getTime() + r.cooldown_hours * 3600_000 > Date.now()) fail("Please wait a little before trying again.");
    const held = (await c.query(`SELECT 1 FROM certifications WHERE user_id = $1 AND state IN ('passed','in_training','ready') AND tool_id IN (SELECT tool_id FROM test_tools WHERE test_id = $2)
      UNION ALL SELECT 1 FROM tool_auths_effective WHERE user_id = $1 AND NOT expired AND retake_due_on IS NULL AND tool_id IN (SELECT tool_id FROM test_tools WHERE test_id = $2) LIMIT 1`, [userId, r.test_id])).rowCount;
    if (held) fail("You've already passed this one.");
    if (!(await questionsOf(c, r.id)).length) fail("There's no test to take right now.");
    const seed = Math.floor(Math.random() * 2 ** 31);
    const a = (await c.query("INSERT INTO attempts (user_id, revision_id, seed, due_at) VALUES ($1,$2,$3, CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(mins => $4::int) END) RETURNING id, user_id, revision_id, status, seed, due_at, answers, seq", [userId, r.id, seed, r.time_limit_min])).rows[0] as Row;
    return view(c, a, r);
  });
}

const only = (answers: unknown, ids: number[]) => {
  const o: Record<string, unknown> = {}, src = answers && typeof answers === "object" && !Array.isArray(answers) ? (answers as any) : {};
  for (const id of ids) if (id in src) o[id] = src[id];
  if (JSON.stringify(o).length > MAX_ANSWERS_BYTES) fail("Those answers are too big.");
  return o;
};
async function mine(c: PoolClient, userId: number, id: unknown) {
  const a = (await c.query("SELECT id, user_id, revision_id, status, seed, due_at, answers, seq FROM attempts WHERE id = $1 AND user_id = $2 AND NOT preview FOR UPDATE", [Number.isInteger(id) ? id : 0, userId])).rows[0] as Row | undefined;
  if (!a) return fail("not found");
  const r = (await c.query(`SELECT ${REV} FROM test_revisions r WHERE r.id = $1`, [a.revision_id])).rows[0] as Rev;
  return { a, r };
}

/** Autosave. `seq` must be higher than the last save, so a slow older request can't overwrite newer answers. */
export async function save(userId: number, attemptId: unknown, answers: unknown, seq: unknown) {
  return tx(async (c) => {
    const { a, r } = await mine(c, userId, attemptId);
    if (a.status !== "in_progress") return fail("This attempt is finished.");
    if (a.due_at && a.due_at.getTime() + GRACE_MS < Date.now()) return fail("Time is up.");
    if (!Number.isInteger(seq) || (seq as number) <= a.seq) return { ok: true, stale: true };
    const ids = drawn(await questionsOf(c, a.revision_id), r, a.seed).map((q) => q.id);
    await c.query("UPDATE attempts SET answers = $2, seq = $3 WHERE id = $1", [a.id, JSON.stringify(only(answers, ids)), seq]);
    return { ok: true };
  });
}

/** Grades the attempt from the key on the server. `answers` null means "use what was autosaved". Marks it submitted, or expired when it came in late. */
async function settle(c: PoolClient, a: Row, r: Rev, answers: unknown) {
  const all = await questionsOf(c, a.revision_id), qs = drawn(all, r, a.seed), late = !!a.due_at && a.due_at.getTime() + GRACE_MS < Date.now();
  const given = late || answers === null ? a.answers : only(answers, qs.map((q) => q.id)), s = scoreQuestions(qs, given, r.pass_pct), passed = s.passed && !late;
  await c.query("UPDATE attempts SET status = $2, submitted_at = now(), answers = $3, per_question = $4, points = $5, max_points = $6, pct = $7, passed = $8 WHERE id = $1",
    [a.id, late ? "expired" : "submitted", JSON.stringify(given), JSON.stringify(s.per), s.points, s.max, s.pct, passed]);
  const satisfied: number[] = [];
  if (passed) {
    for (const t of (await c.query("SELECT tool_id FROM test_tools WHERE test_id = $1", [r.test_id])).rows) {
      if (await satisfyRollout(c, a.user_id, t.tool_id, a.revision_id)) { satisfied.push(t.tool_id); continue; } // re-passing after a major revision keeps the authorization: no new sign-off
      const cert = (await c.query(`INSERT INTO certifications (user_id, tool_id, revision_id, attempt_id, state, signoffs_required) VALUES ($1,$2,$3,$4,'passed', COALESCE((SELECT signoffs_required FROM tool_training WHERE tool_id = $2), 1))
        ON CONFLICT (user_id, tool_id) WHERE state IN ('passed','in_training','ready') DO NOTHING RETURNING id`, [a.user_id, t.tool_id, a.revision_id, a.id])).rows[0];
      if (cert) await c.query("INSERT INTO cert_events (cert_id, actor, kind, note, data) VALUES ($1,'system','attempt.passed','Passed the test',$2)", [cert.id, JSON.stringify({ attempt: a.id, pct: s.pct })]);
    }
  }
  return { late, ...s, passed, satisfied };
}

/** Final submit. A second submit (double click, two tabs) finds the attempt finished and just returns its result. */
export async function submit(userId: number, attemptId: unknown, answers: unknown) {
  const done = await tx(async (c) => {
    const { a, r } = await mine(c, userId, attemptId);
    return { id: a.id, settled: a.status === "in_progress" ? await settle(c, a, r, answers ?? null) : null, r };
  });
  if (done.settled) await announce(userId, done.id, done.r, done.settled); // after the commit: a failing email can't undo the grade
  return result(userId, done.id);
}
async function announce(userId: number, attemptId: number, r: Rev, s: { passed: boolean; satisfied: number[] }) {
  const c = await conn(), tools = (await c.query("SELECT tl.id, tl.name FROM test_tools tt JOIN tools tl ON tl.id = tt.tool_id WHERE tt.test_id = $1", [r.test_id])).rows;
  const tool = tools.map((t) => t.name).join(", ");
  if (s.passed) {
    for (const t of tools) await emit(s.satisfied.includes(t.id) ? "rollout.satisfied" : "attempt.passed", { userId, ref: `${attemptId}:${t.id}`, vars: { tool: t.name } });
    return;
  }
  const used = (await c.query("SELECT count(*)::int AS n FROM attempts WHERE user_id = $1 AND revision_id = (SELECT revision_id FROM attempts WHERE id = $2) AND NOT preview AND status IN ('submitted','expired')", [userId, attemptId])).rows[0].n;
  await emit(r.max_attempts && used >= r.max_attempts ? "attempts.exhausted" : "attempt.failed", { userId, ref: attemptId, vars: { tool } });
}

/** The result of a finished attempt, shaped by the test's review mode: score only, plus which were missed (default, no answers shown), or everything with the right answers. */
export async function result(userId: number, attemptId: unknown) {
  const c = await conn(), a = (await c.query("SELECT id, revision_id, status, pct::float AS pct, passed, points::float AS points, max_points::float AS max, per_question, submitted_at FROM attempts WHERE id = $1 AND user_id = $2 AND NOT preview", [Number.isInteger(attemptId) ? attemptId : 0, userId])).rows[0];
  if (!a) return fail("not found");
  if (a.status === "in_progress") return fail("This attempt isn't finished.");
  const r = (await c.query("SELECT pass_pct, review_mode FROM test_revisions WHERE id = $1", [a.revision_id])).rows[0];
  const out: any = { attemptId: a.id, status: a.status, pct: a.pct, passed: a.passed === true, points: a.points, max: a.max, pass_pct: r.pass_pct, review: r.review_mode, submitted_at: a.submitted_at };
  if (r.review_mode === "score") return out;
  const qs = new Map((await questionsOf(c, a.revision_id)).map((q) => [q.id, q]));
  out.questions = (a.per_question as { id: number; correct: boolean }[]).map((p) => {
    const q = qs.get(p.id)!;
    return { id: p.id, correct: p.correct, prompt_html: q.prompt_html, ...(r.review_mode === "all" ? { answer: describeQ(q), feedback_html: q.feedback_html } : {}) };
  }).filter((q) => r.review_mode === "all" || !q.correct);
  return out;
}

/** The Training page: one entry per tool with a published test, and where this member stands on it. */
export async function overview(userId: number) {
  const c = await conn();
  const rows = (await c.query(`SELECT t.id AS test_id, t.title, tl.id AS tool_id, tl.name AS tool, tl.category, r.id AS rev_id, r.max_attempts, r.cooldown_hours,
      (SELECT id FROM attempts a WHERE a.user_id = $1 AND a.revision_id = r.id AND a.status = 'in_progress' AND NOT a.preview) AS open_attempt,
      (SELECT due_at FROM attempts a WHERE a.user_id = $1 AND a.revision_id = r.id AND a.status = 'in_progress' AND NOT a.preview) AS open_due,
      (SELECT count(*)::int FROM attempts a WHERE a.user_id = $1 AND a.revision_id = r.id AND a.status IN ('submitted','expired') AND NOT a.preview) AS used,
      (SELECT max(submitted_at) FROM attempts a WHERE a.user_id = $1 AND a.revision_id = r.id AND a.status IN ('submitted','expired') AND NOT a.preview) AS last_at,
      (SELECT state FROM certifications ce WHERE ce.user_id = $1 AND ce.tool_id = tl.id AND ce.state IN ('passed','in_training','ready') LIMIT 1) AS cert,
      (SELECT to_char(retake_due_on,'YYYY-MM-DD') FROM tool_auths_effective ae WHERE ae.user_id = $1 AND ae.tool_id = tl.id AND NOT ae.expired) AS retake_by,
      EXISTS (SELECT 1 FROM tool_auths_effective ae WHERE ae.user_id = $1 AND ae.tool_id = tl.id AND NOT ae.expired) AS certified,
      EXISTS (SELECT 1 FROM rollout_members rm JOIN rollouts ro ON ro.id = rm.rollout_id WHERE rm.user_id = $1 AND rm.tool_id = tl.id AND rm.status = 'lapsed' AND ro.undone_at IS NULL) AS lapsed
    FROM tests t JOIN test_tools tt ON tt.test_id = t.id JOIN tools tl ON tl.id = tt.tool_id JOIN test_revisions r ON r.test_id = t.id AND r.status = 'published'
    WHERE NOT t.archived AND tl.archived_at IS NULL ORDER BY lower(tl.category), lower(tl.name)`, [userId])).rows;
  const now = Date.now();
  const cards = rows.map((x) => {
    const wait = x.last_at && x.cooldown_hours ? new Date(x.last_at).getTime() + x.cooldown_hours * 3600_000 - now : 0;
    const state = x.open_attempt ? "in_progress" : x.cert ? "awaiting_trainer" : x.certified && !x.retake_by ? "certified" : x.max_attempts && x.used >= x.max_attempts ? "locked" : wait > 0 ? "cooldown" : x.retake_by ? "retake" : x.lapsed ? "lapsed" : "not_started";
    return { test_id: x.test_id, title: x.title, tool: x.tool, category: x.category, state, attempt_id: x.open_attempt, due_at: x.open_due, retake_by: x.retake_by, wait_hours: wait > 0 ? Math.ceil(wait / 3600_000) : 0 };
  });
  const history = (await c.query(`SELECT a.id, tl.name AS tool, a.status, a.pct::float AS pct, a.passed, a.submitted_at FROM attempts a JOIN test_revisions r ON r.id = a.revision_id JOIN test_tools tt ON tt.test_id = r.test_id JOIN tools tl ON tl.id = tt.tool_id
    WHERE a.user_id = $1 AND NOT a.preview AND a.status IN ('submitted','expired') ORDER BY a.submitted_at DESC LIMIT 50`, [userId])).rows;
  return { cards, history };
}
