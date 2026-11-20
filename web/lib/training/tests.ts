import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { conn } from "../db";
import { logAudit } from "../store";
import { cleanHtml } from "../sanitize";
import { cleanQuestion, memberQuestion, problems, scoreQuestions, describeQ, type Q } from "./questions";
import { diffRevisions, revisionHash, SETTINGS, type RevData } from "./diff";

// Tests, drafts, revisions. A test belongs to a tool (v1: one live test per tool). Editing happens only on the one draft; publishing freezes it as a revision (the database refuses later edits).
// Every draft change carries `at`, the version it was loaded at, so two authors can't silently overwrite each other.
const MAX_QUESTIONS = 100;
export type Rev = { id: number; test_id: number; rev_no: number; status: "draft" | "published" | "retired"; change_kind: string; change_note: string; intro_html: string; pass_pct: number; time_limit_min: number | null; max_attempts: number | null; cooldown_hours: number; shuffle_questions: boolean; shuffle_choices: boolean; pool_size: number | null; review_mode: string; grace_days: number; created_by: string; created_at: string; published_by: string | null; published_at: string | null; at: string; tampered?: boolean };
const REV = "id, test_id, rev_no, status, change_kind, change_note, intro_html, pass_pct, time_limit_min, max_attempts, cooldown_hours, shuffle_questions, shuffle_choices, pool_size, review_mode, grace_days, created_by, created_at, published_by, published_at, updated_at::text AS at";
const QCOLS = "id, qkey, position, type, prompt_html, points::float AS points, config, feedback_html, required_correct";
const fail = (m: string): never => { throw new Error(m); };

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await conn()).connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
/** Locks the draft being changed and checks the caller saw its latest version. */
async function lockDraft(c: PoolClient, revId: unknown, at: unknown): Promise<Rev> {
  const r = (await c.query(`SELECT ${REV} FROM test_revisions WHERE id = $1 FOR UPDATE`, [Number.isInteger(revId) ? revId : 0])).rows[0] as Rev | undefined;
  if (!r) return fail("No such test.");
  if (r.status !== "draft") return fail("This revision is published and can't be changed. Start a new draft.");
  if (at !== r.at) return fail("Someone else changed this draft. Reload the page to see their changes.");
  return r;
}
const bump = async (c: PoolClient, id: number) => (await c.query("UPDATE test_revisions SET updated_at = clock_timestamp() WHERE id = $1 RETURNING updated_at::text AS at", [id])).rows[0].at as string;
const questionsOf = async (c: { query: PoolClient["query"] }, revId: number) => (await c.query(`SELECT ${QCOLS} FROM rev_questions WHERE revision_id = $1 ORDER BY position, id`, [revId])).rows as (Q & { id: number; qkey: string })[];
const dataOf = (r: Rev, questions: (Q & { qkey: string })[]): RevData => ({ settings: Object.fromEntries(SETTINGS.map((k) => [k, k === "intro_html" ? r.intro_html : (r as any)[k]])) as any, questions });

// ---- library --------------------------------------------------------------------------------------------------------------------------
export const listTests = async () => (await (await conn()).query(`SELECT t.id, t.title, t.archived, tt.tool_id, tl.name AS tool, tl.category,
    (SELECT rev_no FROM test_revisions r WHERE r.test_id = t.id AND r.status = 'published') AS published_rev, (SELECT rev_no FROM test_revisions r WHERE r.test_id = t.id AND r.status = 'draft') AS draft_rev,
    (SELECT count(*)::int FROM rev_questions q JOIN test_revisions r ON r.id = q.revision_id WHERE r.test_id = t.id AND r.status = 'published') AS questions,
    (SELECT count(*)::int FROM attempts a JOIN test_revisions r ON r.id = a.revision_id WHERE r.test_id = t.id AND NOT a.preview AND a.status = 'submitted') AS attempts,
    (SELECT round(100.0 * count(*) FILTER (WHERE a.passed) / NULLIF(count(*), 0))::int FROM attempts a JOIN test_revisions r ON r.id = a.revision_id WHERE r.test_id = t.id AND NOT a.preview AND a.status = 'submitted') AS pass_rate
  FROM tests t JOIN test_tools tt ON tt.test_id = t.id JOIN tools tl ON tl.id = tt.tool_id ORDER BY t.archived, lower(tl.category), lower(tl.name)`)).rows;
export const toolsWithoutTest = async () => (await (await conn()).query("SELECT id, name, category FROM tools t WHERE archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM test_tools tt JOIN tests x ON x.id = tt.test_id WHERE tt.tool_id = t.id AND NOT x.archived) ORDER BY lower(category), lower(name)")).rows;

export async function createTest(toolId: unknown, title: unknown, who: string) {
  const name = typeof title === "string" ? title.trim().slice(0, 120) : "";
  const id = await tx(async (c) => {
    const tool = (await c.query("SELECT name FROM tools WHERE id = $1 AND archived_at IS NULL FOR UPDATE", [Number.isInteger(toolId) ? toolId : 0])).rows[0]; // the lock makes two simultaneous creates for one tool take turns
    if (!tool) return fail("Choose a tool.");
    if ((await c.query("SELECT 1 FROM test_tools tt JOIN tests x ON x.id = tt.test_id WHERE tt.tool_id = $1 AND NOT x.archived", [toolId])).rowCount) return fail("That tool already has a test.");
    const t = (await c.query("INSERT INTO tests (title, created_by) VALUES ($1,$2) RETURNING id", [name || `${tool.name} safety test`, who])).rows[0].id;
    await c.query("INSERT INTO test_tools (test_id, tool_id) VALUES ($1,$2)", [t, toolId]);
    await c.query("INSERT INTO test_revisions (test_id, rev_no, created_by) VALUES ($1, 1, $2)", [t, who]);
    return t as number;
  });
  await logAudit(who, "training.test.create", `Test #${id} created`);
  return id;
}
export async function renameTest(id: unknown, title: unknown) {
  const t = typeof title === "string" ? title.trim().slice(0, 120) : "";
  if (!t) fail("A test needs a title.");
  await (await conn()).query("UPDATE tests SET title = $2 WHERE id = $1", [id, t]);
}
export async function archiveTest(id: unknown, on: unknown, who: string) {
  await tx(async (c) => {
    if (on !== true) {
      await c.query("SELECT t.id FROM tools t JOIN test_tools me ON me.tool_id = t.id WHERE me.test_id = $1 FOR UPDATE", [id]); // same lock as createTest
      if ((await c.query("SELECT 1 FROM test_tools tt JOIN test_tools me ON me.tool_id = tt.tool_id JOIN tests x ON x.id = tt.test_id WHERE me.test_id = $1 AND tt.test_id <> $1 AND NOT x.archived", [id])).rowCount) fail("That tool has another test now.");
    }
    await c.query("UPDATE tests SET archived = $2 WHERE id = $1", [id, on === true]);
  });
  await logAudit(who, "training.test.archive", `Test #${id} ${on === true ? "archived" : "restored"}`);
}
/** Only a test that was never published can be deleted outright; anything with history is archived. */
export async function deleteTest(id: unknown, who: string) {
  const c = await conn();
  if ((await c.query("SELECT 1 FROM test_revisions WHERE test_id = $1 AND status <> 'draft'", [id])).rowCount) fail("This test has been published, so it can only be archived.");
  await c.query("DELETE FROM tests WHERE id = $1", [id]);
  await logAudit(who, "training.test.delete", `Test #${id} deleted`);
}

// ---- reading --------------------------------------------------------------------------------------------------------------------------
export async function getTest(id: number) {
  const c = await conn();
  const test = (await c.query("SELECT t.id, t.title, t.archived, tt.tool_id, tl.name AS tool FROM tests t JOIN test_tools tt ON tt.test_id = t.id JOIN tools tl ON tl.id = tt.tool_id WHERE t.id = $1", [id])).rows[0];
  if (!test) return null;
  const revisions = (await c.query(`SELECT r.id, r.rev_no, r.status, r.change_kind, r.change_note, r.published_by, r.published_at, r.created_by, (SELECT count(*)::int FROM rev_questions q WHERE q.revision_id = r.id) AS questions,
    (SELECT count(*)::int FROM attempts a WHERE a.revision_id = r.id AND NOT a.preview AND a.status = 'submitted') AS attempts FROM test_revisions r WHERE r.test_id = $1 ORDER BY r.rev_no DESC`, [id])).rows;
  return { test, revisions, affects: await affectedCount(id) };
}
export async function getRevision(revId: number): Promise<{ rev: Rev; questions: (Q & { id: number; qkey: string })[] } | null> {
  const c = await conn(), rev = (await c.query(`SELECT ${REV}, content_hash FROM test_revisions WHERE id = $1`, [revId])).rows[0];
  if (!rev) return null;
  const questions = await questionsOf(c, revId), { content_hash, ...r } = rev;
  if (r.status !== "draft") r.tampered = content_hash !== revisionHash(dataOf(r, questions));
  return { rev: r, questions };
}
/** Members holding a live authorization on this test's tools: who a major revision would put on the clock. */
export const affectedCount = async (testId: number) => (await (await conn()).query("SELECT count(*)::int AS n FROM tool_auths_effective a JOIN test_tools tt ON tt.tool_id = a.tool_id WHERE tt.test_id = $1 AND NOT a.expired", [testId])).rows[0].n as number;

// ---- drafts ---------------------------------------------------------------------------------------------------------------------------
/** The test's draft, made from the current published revision (same question keys) if there isn't one yet. */
export async function newDraft(testId: unknown, who: string): Promise<number> {
  const r = await tx(async (c) => {
    await c.query("SELECT id FROM tests WHERE id = $1 FOR UPDATE", [testId]);
    const have = (await c.query("SELECT id FROM test_revisions WHERE test_id = $1 AND status = 'draft'", [testId])).rows[0];
    if (have) return { id: have.id as number, made: false };
    const base = (await c.query("SELECT id, rev_no FROM test_revisions WHERE test_id = $1 ORDER BY (status = 'published') DESC, rev_no DESC LIMIT 1", [testId])).rows[0];
    if (!base) return fail("No such test.");
    const n = (await c.query("SELECT max(rev_no) + 1 AS n FROM test_revisions WHERE test_id = $1", [testId])).rows[0].n;
    const id = (await c.query(`INSERT INTO test_revisions (test_id, rev_no, intro_html, pass_pct, time_limit_min, max_attempts, cooldown_hours, shuffle_questions, shuffle_choices, pool_size, review_mode, grace_days, created_by)
      SELECT test_id, $2, intro_html, pass_pct, time_limit_min, max_attempts, cooldown_hours, shuffle_questions, shuffle_choices, pool_size, review_mode, grace_days, $3 FROM test_revisions WHERE id = $1 RETURNING id`, [base.id, n, who])).rows[0].id as number;
    await c.query("INSERT INTO rev_questions (revision_id, qkey, position, type, prompt_html, points, config, feedback_html, required_correct) SELECT $2, qkey, position, type, prompt_html, points, config, feedback_html, required_correct FROM rev_questions WHERE revision_id = $1", [base.id, id]);
    return { id, made: true };
  });
  if (r.made) await logAudit(who, "training.test.draft", `Test #${testId}: new draft`);
  return r.id;
}

const int = (v: unknown, lo: number, hi: number, name: string) => { if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) fail(`${name} must be a whole number from ${lo} to ${hi}.`); return v as number; };
const maybe = (v: unknown, lo: number, hi: number, name: string) => (v === null || v === "" ? null : int(v, lo, hi, name));
export async function saveSettings(revId: unknown, at: unknown, b: any) {
  return tx(async (c) => {
    const r = await lockDraft(c, revId, at), s: Record<string, unknown> = {};
    if ("pass_pct" in b) s.pass_pct = int(b.pass_pct, 1, 100, "Pass mark");
    if ("time_limit_min" in b) s.time_limit_min = maybe(b.time_limit_min, 1, 480, "Time limit");
    if ("max_attempts" in b) s.max_attempts = maybe(b.max_attempts, 1, 50, "Attempts");
    if ("pool_size" in b) s.pool_size = maybe(b.pool_size, 1, MAX_QUESTIONS, "Questions drawn");
    if ("cooldown_hours" in b) s.cooldown_hours = int(b.cooldown_hours, 0, 720, "Wait between attempts");
    if ("grace_days" in b) s.grace_days = int(b.grace_days, 1, 365, "Grace period");
    if ("shuffle_questions" in b) s.shuffle_questions = b.shuffle_questions === true;
    if ("shuffle_choices" in b) s.shuffle_choices = b.shuffle_choices === true;
    if ("review_mode" in b) s.review_mode = ["score", "missed", "all"].includes(b.review_mode) ? b.review_mode : fail("Choose what members see after a test.");
    if ("intro_html" in b) s.intro_html = cleanHtml(typeof b.intro_html === "string" ? b.intro_html.slice(0, 10000) : "");
    const keys = Object.keys(s);
    if (keys.length) await c.query(`UPDATE test_revisions SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`, [r.id, ...Object.values(s)]);
    return { at: await bump(c, r.id) };
  });
}
export async function saveQuestion(revId: unknown, at: unknown, raw: any) {
  return tx(async (c) => {
    const r = await lockDraft(c, revId, at), q = cleanQuestion(raw);
    let id = raw?.id;
    if (Number.isInteger(id)) {
      if (!(await c.query("UPDATE rev_questions SET type=$3, prompt_html=$4, points=$5, config=$6, feedback_html=$7, required_correct=$8 WHERE id = $1 AND revision_id = $2", [id, r.id, q.type, q.prompt_html, q.points, JSON.stringify(q.config), q.feedback_html, q.required_correct])).rowCount) fail("That question isn't in this draft.");
    } else {
      if ((await c.query("SELECT count(*)::int AS n FROM rev_questions WHERE revision_id = $1", [r.id])).rows[0].n >= MAX_QUESTIONS) fail(`A test can have at most ${MAX_QUESTIONS} questions.`);
      id = (await c.query("INSERT INTO rev_questions (revision_id, position, type, prompt_html, points, config, feedback_html, required_correct) SELECT $1, COALESCE(max(position), -1) + 1, $2,$3,$4,$5,$6,$7 FROM rev_questions WHERE revision_id = $1 RETURNING id", [r.id, q.type, q.prompt_html, q.points, JSON.stringify(q.config), q.feedback_html, q.required_correct])).rows[0].id;
    }
    return { id: id as number, at: await bump(c, r.id) };
  });
}
export async function deleteQuestion(revId: unknown, at: unknown, qid: unknown) {
  return tx(async (c) => { const r = await lockDraft(c, revId, at); await c.query("DELETE FROM rev_questions WHERE id = $1 AND revision_id = $2", [qid, r.id]); return { at: await bump(c, r.id) }; });
}
export async function reorderQuestions(revId: unknown, at: unknown, ids: unknown) {
  return tx(async (c) => {
    const r = await lockDraft(c, revId, at), have = (await c.query("SELECT id FROM rev_questions WHERE revision_id = $1", [r.id])).rows.map((x) => x.id as number).sort((a, b) => a - b);
    const want = Array.isArray(ids) ? ids.filter(Number.isInteger).sort((a, b) => a - b) : [];
    if (have.join() !== want.join()) fail("The question list changed. Reload the page.");
    await c.query("UPDATE rev_questions q SET position = o.n FROM unnest($2::int[]) WITH ORDINALITY AS o(id, n) WHERE q.id = o.id AND q.revision_id = $1", [r.id, ids]);
    return { at: await bump(c, r.id) };
  });
}
export async function discardDraft(revId: unknown, who: string) {
  const t = await tx(async (c) => {
    const r = (await c.query("SELECT test_id, status FROM test_revisions WHERE id = $1 FOR UPDATE", [Number.isInteger(revId) ? revId : 0])).rows[0];
    if (!r || r.status !== "draft") return fail("Only a draft can be discarded.");
    if (!(await c.query("SELECT 1 FROM test_revisions WHERE test_id = $1 AND status <> 'draft'", [r.test_id])).rowCount) return fail("This test has no published revision to fall back on. Delete the test instead.");
    await c.query("DELETE FROM test_revisions WHERE id = $1", [revId]);
    return r.test_id;
  });
  await logAudit(who, "training.test.discard", `Test #${t}: draft discarded`);
}

// ---- publishing -----------------------------------------------------------------------------------------------------------------------
/** What would stop this draft from being published, one line per problem. */
export async function publishProblems(revId: number): Promise<string[]> {
  const got = await getRevision(revId);
  if (!got) return ["No such test."];
  const { rev, questions } = got, out: string[] = [];
  if (!questions.length) out.push("Add at least one question.");
  if (rev.pool_size && rev.pool_size > questions.length) out.push(`It draws ${rev.pool_size} questions but has only ${questions.length}.`);
  questions.forEach((q, i) => problems(q).forEach((p) => out.push(`Question ${i + 1}: ${p}`)));
  return out;
}
export async function publish(revId: unknown, at: unknown, b: { kind?: unknown; note?: unknown }, who: string) {
  const out = await tx(async (c) => {
    const r = await lockDraft(c, revId, at), bad = await publishProblems(r.id);
    if (bad.length) return fail("Can't publish yet:\n" + bad.join("\n"));
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "", first = r.rev_no === 1, kind = first || b.kind === "major" ? "major" : b.kind === "minor" ? "minor" : fail("Say whether this change is major or minor.");
    if (!first && note.length < 5) fail("Describe what changed (this is emailed to members when it's a major change).");
    const hash = revisionHash(dataOf(r, await questionsOf(c, r.id)));
    await c.query("UPDATE test_revisions SET status = 'retired' WHERE test_id = $1 AND status = 'published'", [r.test_id]);
    await c.query("UPDATE test_revisions SET status = 'published', change_kind = $2, change_note = $3, content_hash = $4, published_by = $5, published_at = now(), updated_at = clock_timestamp() WHERE id = $1", [r.id, kind, note || "First version.", hash, who]);
    return { testId: r.test_id, revNo: r.rev_no, kind };
  });
  await logAudit(who, "training.test.publish", `Test #${out.testId}: revision ${out.revNo} published (${out.kind})`);
  return { id: revId as number, ...out };
}

// ---- compare, preview, export/import --------------------------------------------------------------------------------------------------
export async function compare(aId: number, bId: number) {
  const [a, b] = await Promise.all([getRevision(aId), getRevision(bId)]);
  if (!a || !b || a.rev.test_id !== b.rev.test_id) return fail("Those revisions aren't of the same test.");
  const d = diffRevisions(dataOf(a.rev, a.questions), dataOf(b.rev, b.questions)), name = new Map([...a.questions, ...b.questions].map((q) => [q.qkey, q]));
  return { ...d, added: d.added.map((k) => ({ qkey: k, text: plainText(name.get(k)!) })), removed: d.removed.map((k) => ({ qkey: k, text: plainText(name.get(k)!) })) };
}
const plainText = (q: Q) => q.prompt_html.replace(/<[^>]*>/g, "").trim().slice(0, 100) || "(no text)";
/** The questions as a member would see them (no key), for the author's "preview as member". Takes no attempt and creates nothing. */
export async function previewQuestions(revId: number, seed: number) {
  const g = await getRevision(revId);
  if (!g) return fail("No such test.");
  return { rev: g.rev, questions: g.questions.map((q) => memberQuestion(q, seed, g.rev.shuffle_choices)) };
}
/** Grades preview answers and shows the author what the key was. */
export async function previewGrade(revId: number, answers: unknown) {
  const g = await getRevision(revId);
  if (!g) return fail("No such test.");
  const s = scoreQuestions(g.questions, answers && typeof answers === "object" ? (answers as any) : {}, g.rev.pass_pct);
  return { ...s, per: s.per.map((p, i) => ({ ...p, answer: describeQ(g.questions[i]), feedback_html: g.questions[i].feedback_html })) };
}
export async function exportRevision(revId: number) {
  const [g, t] = await Promise.all([getRevision(revId), conn()]);
  if (!g) return fail("No such test.");
  const title = (await t.query("SELECT title FROM tests WHERE id = $1", [g.rev.test_id])).rows[0]?.title;
  return { format: "kzoo-training-test", version: 1, title, settings: Object.fromEntries(SETTINGS.map((k) => [k, k === "intro_html" ? g.rev.intro_html : (g.rev as any)[k]])), questions: g.questions.map(({ qkey, type, prompt_html, points, config, feedback_html, required_correct }) => ({ qkey, type, prompt_html, points, config, feedback_html, required_correct })) };
}
/** Replaces the draft's questions (and, if present, its settings) with an exported test. */
export async function importIntoDraft(revId: unknown, at: unknown, data: any) {
  if (data?.format !== "kzoo-training-test" || data?.version !== 1 || !Array.isArray(data.questions)) fail("That isn't a training test export.");
  if (data.questions.length > MAX_QUESTIONS) fail(`A test can have at most ${MAX_QUESTIONS} questions.`);
  const r = await tx(async (c) => {
    const d = await lockDraft(c, revId, at);
    // A question keeps its key only if this test already has it (same question, another revision); otherwise it is new here, so another test's statistics can't merge with it.
    const mine = new Set((await c.query("SELECT DISTINCT qkey::text AS k FROM rev_questions q JOIN test_revisions r ON r.id = q.revision_id WHERE r.test_id = $1", [d.test_id])).rows.map((x) => x.k));
    const qs = data.questions.map((x: any) => ({ ...cleanQuestion(x), qkey: typeof x?.qkey === "string" && mine.has(x.qkey.toLowerCase()) ? x.qkey.toLowerCase() : randomUUID() }));
    if (new Set(qs.map((q: any) => q.qkey)).size !== qs.length) fail("The export lists the same question twice.");
    await c.query("DELETE FROM rev_questions WHERE revision_id = $1", [d.id]);
    for (const [i, q] of qs.entries()) await c.query("INSERT INTO rev_questions (revision_id, qkey, position, type, prompt_html, points, config, feedback_html, required_correct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [d.id, q.qkey, i, q.type, q.prompt_html, q.points, JSON.stringify(q.config), q.feedback_html, q.required_correct]);
    return { at: await bump(c, d.id) };
  });
  const st = data.settings && typeof data.settings === "object" ? Object.fromEntries(SETTINGS.filter((k) => k in data.settings).map((k) => [k, data.settings[k]])) : {};
  return Object.keys(st).length ? saveSettings(revId, r.at, st) : r;
}
