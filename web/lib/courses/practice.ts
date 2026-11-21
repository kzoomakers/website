import { randomInt } from "node:crypto";
import { conn } from "../db";
import { describeQ, drawQuestions, gradeQ, memberQuestion, type Q } from "../training/questions";
import { cleanTags } from "../library/rules";

// Practice quizzes on the real question bank (moodlecourseware/03). The grader is gradeQ, the same one real tests use. Questions go to the member without keys; the key and feedback come back
// only in the reply to that question's answer. Nothing here reads or writes attempts, certifications or tool_auths.
type Question = Q & { id: number; qkey: string };
type State = { seed: number; ids: number[]; answers: Record<string, { frac: number }> };
const QCOLS = "q.id, q.qkey, q.position, q.type, q.prompt_html, q.points::float AS points, q.config, q.feedback_html, q.required_correct";

/** A test's practice questions from its published revision. Tool tests offer only questions flagged practice_ok (so members can't memorise the real test); a test with no tool is a standalone quiz and offers all of them. */
async function pool(testId: number) {
  const c = await conn(), t = (await c.query(`SELECT t.id, t.title, r.id AS rev, EXISTS (SELECT 1 FROM test_tools tt WHERE tt.test_id = t.id) AS tool FROM tests t JOIN test_revisions r ON r.test_id = t.id AND r.status = 'published' WHERE t.id = $1 AND NOT t.archived`, [testId])).rows[0];
  if (!t) return null;
  const qs = (await c.query(`SELECT ${QCOLS} FROM rev_questions q LEFT JOIN question_practice p ON p.qkey = q.qkey WHERE q.revision_id = $1 ${t.tool ? "AND p.practice_ok" : ""} ORDER BY q.position, q.id`, [t.rev])).rows as Question[];
  return { title: t.title as string, tool: t.tool as boolean, qs };
}
/** Tests with practice questions available, for lesson quiz blocks. */
export async function practiceTitles(ids: number[]) {
  const out: Record<number, string> = {};
  for (const id of ids) { const p = await pool(id); if (p?.qs.length) out[id] = p.title; }
  return out;
}

const own = async (userId: number, id: number) => {
  const r = (await (await conn()).query("SELECT id, test_id, finished_at, state FROM practice_attempts WHERE id = $1 AND user_id = $2", [id, userId])).rows[0];
  if (!r) throw new Error("That practice run doesn't exist.");
  return r as { id: number; test_id: number; finished_at: Date | null; state: State };
};
const byIds = async (ids: number[]) => (await (await conn()).query(`SELECT ${QCOLS} FROM rev_questions q WHERE q.id = ANY($1)`, [ids])).rows as Question[];

/** Starts practice, or resumes the unfinished run. `retryMissed` starts a new run with only the questions the last finished run got wrong. */
export async function startPractice(userId: number, testId: number, retryMissed = false) {
  const p = await pool(testId), c = await conn();
  if (!p || !p.qs.length) throw new Error("There is no practice quiz here yet.");
  const last = (await c.query("SELECT id, finished_at, state FROM practice_attempts WHERE user_id = $1 AND test_id = $2 ORDER BY id DESC LIMIT 1", [userId, testId])).rows[0] as { id: number; finished_at: Date | null; state: State } | undefined;
  if (last && !last.finished_at) return last.id;
  const seed = randomInt(1, 2 ** 30), missed = new Set(last ? last.state.ids.filter((i) => (last.state.answers[i]?.frac ?? 0) < 1) : []);
  const base = retryMissed && missed.size ? p.qs.filter((q) => missed.has(q.id)) : p.qs;
  const ids = drawQuestions(base, seed, null, true).map((q) => q.id);
  return (await c.query("INSERT INTO practice_attempts (user_id, test_id, state) VALUES ($1, $2, $3) RETURNING id", [userId, testId, JSON.stringify({ seed, ids, answers: {} } satisfies State)])).rows[0].id as number;
}

const strip = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
/** Where a run stands: the next question to show, or the results with the right answers for what was missed. */
export async function practiceView(userId: number, id: number) {
  const a = await own(userId, id), s = a.state, title = (await (await conn()).query("SELECT title, EXISTS (SELECT 1 FROM test_tools tt WHERE tt.test_id = tests.id) AS tool FROM tests WHERE id = $1", [a.test_id])).rows[0];
  const qs = await byIds(s.ids), byId = new Map(qs.map((q) => [q.id, q])), answered = s.ids.filter((i) => s.answers[i]);
  const head = { id, testId: a.test_id, title: title.title as string, realTest: title.tool as boolean, total: s.ids.length, answered: answered.length, correct: answered.filter((i) => s.answers[i].frac === 1).length };
  const nextId = s.ids.find((i) => !s.answers[i]);
  if (nextId !== undefined) return { ...head, done: false as const, question: memberQuestion(byId.get(nextId)!, s.seed, true) };
  const missed = s.ids.filter((i) => s.answers[i].frac < 1).map((i) => { const q = byId.get(i)!; return { id: i, prompt: strip(q.prompt_html), answer: describeQ(q), feedback_html: q.feedback_html }; });
  const max = qs.reduce((t, q) => t + q.points, 0), got = qs.reduce((t, q) => t + q.points * (s.answers[q.id]?.frac ?? 0), 0);
  return { ...head, done: true as const, pct: max ? Math.round((got / max) * 100) : 0, missed };
}

/** Grades one answer, remembers it, and (only now) returns the right answer and the author's feedback. Each question is answered once per run. */
export async function practiceAnswer(userId: number, id: number, qid: number, answer: unknown) {
  const a = await own(userId, id);
  if (a.finished_at || !a.state.ids.includes(qid) || a.state.answers[qid]) throw new Error("That question was already answered.");
  const q = (await byIds([qid]))[0], frac = gradeQ(q, answer);
  a.state.answers[qid] = { frac };
  const done = a.state.ids.every((i) => a.state.answers[i]);
  await (await conn()).query(`UPDATE practice_attempts SET state = $2, finished_at = ${done ? "now()" : "NULL"} WHERE id = $1`, [id, JSON.stringify(a.state)]);
  return { correct: frac === 1, partial: frac > 0 && frac < 1, answer: describeQ(q), feedback_html: q.feedback_html };
}

// ---- Author side: tags and the practice_ok switch (learning permission) ----
export const practiceTests = async () => (await (await conn()).query(`SELECT t.id, t.title, EXISTS (SELECT 1 FROM test_tools tt WHERE tt.test_id = t.id) AS tool,
  (SELECT r.id FROM test_revisions r WHERE r.test_id = t.id AND r.status = 'published') IS NOT NULL AS published FROM tests t WHERE NOT t.archived ORDER BY lower(t.title)`)).rows;

/** The published (else draft) revision's questions with their practice flags. */
export async function practiceQuestions(testId: number) {
  const r = (await (await conn()).query(`SELECT q.qkey, q.type, q.prompt_html, coalesce(p.tags, '{}') AS tags, coalesce(p.practice_ok, false) AS practice_ok, r.status
    FROM test_revisions r JOIN rev_questions q ON q.revision_id = r.id LEFT JOIN question_practice p ON p.qkey = q.qkey
    WHERE r.id = (SELECT id FROM test_revisions WHERE test_id = $1 AND status IN ('published', 'draft') ORDER BY (status = 'published') DESC LIMIT 1) ORDER BY q.position, q.id`, [testId])).rows;
  return r.map((x) => ({ ...x, prompt: strip(x.prompt_html).slice(0, 200), prompt_html: undefined }));
}
export async function setPractice(qkey: unknown, b: { tags?: unknown; practice_ok?: unknown }) {
  if (typeof qkey !== "string" || !/^[0-9a-f-]{36}$/.test(qkey)) throw new Error("Unknown question.");
  const c = await conn();
  if (!(await c.query("SELECT 1 FROM rev_questions WHERE qkey = $1 LIMIT 1", [qkey])).rowCount) throw new Error("Unknown question.");
  await c.query("INSERT INTO question_practice (qkey, tags, practice_ok) VALUES ($1, $2, $3) ON CONFLICT (qkey) DO UPDATE SET tags = CASE WHEN $4 THEN $2 ELSE question_practice.tags END, practice_ok = CASE WHEN $5 THEN $3 ELSE question_practice.practice_ok END",
    [qkey, cleanTags(b.tags), b.practice_ok === true, b.tags !== undefined, typeof b.practice_ok === "boolean"]);
}
export const setAllPractice = async (testId: number, on: boolean) => { for (const q of await practiceQuestions(testId)) await setPractice(q.qkey, { practice_ok: on }); };
