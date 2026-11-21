import { conn } from "../db";
import { cleanTags } from "../library/rules";
import { cleanQuestion, problems } from "../training/questions";
import { publish } from "../training/tests";
import { formatQuestions, parseQuestions, type TextQ } from "./quiztext";
import { tx } from "./tx";

// Standalone quizzes: a test with no tool, made from pasted text and published at once. Members practise on it (every question is offered) and lessons link to it with a quiz block.
const toQ = (q: TextQ) => cleanQuestion({ type: q.type, prompt_html: `<p>${q.prompt.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>`, feedback_html: q.feedback ? `<p>${q.feedback.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` : "", points: 1,
  config: q.type === "true_false" ? { correct: q.correct } : { choices: q.choices, correct: q.correct, ...(q.type === "mc_multi" ? { scoring: "all" } : {}) } });

/** Parses the text, then creates and publishes a quiz. Nothing is created if any question has a problem; the message names the question. */
export async function createQuiz(title: unknown, text: unknown, who: string) {
  const name = typeof title === "string" ? title.trim().slice(0, 120) : "";
  if (!name) throw new Error("Give the quiz a title.");
  const { questions, errors } = parseQuestions(typeof text === "string" ? text : "");
  if (!errors.length && !questions.length) errors.push("Paste at least one question.");
  const qs = questions.map(toQ);
  qs.forEach((q, i) => problems(q).forEach((p) => errors.push(`Question ${i + 1}: ${p}`)));
  if (errors.length) throw new Error(errors.slice(0, 8).join("\n"));
  const { testId, revId, at } = await tx(async (c) => {
    const testId = (await c.query("INSERT INTO tests (title, created_by) VALUES ($1, $2) RETURNING id", [name, who])).rows[0].id as number;
    const revId = (await c.query("INSERT INTO test_revisions (test_id, rev_no, created_by) VALUES ($1, 1, $2) RETURNING id", [testId, who])).rows[0].id as number;
    for (const [i, q] of qs.entries()) {
      const qkey = (await c.query("INSERT INTO rev_questions (revision_id, position, type, prompt_html, points, config, feedback_html, required_correct) VALUES ($1,$2,$3,$4,$5,$6,$7,false) RETURNING qkey", [revId, i, q.type, q.prompt_html, q.points, JSON.stringify(q.config), q.feedback_html])).rows[0].qkey;
      const tags = cleanTags(questions[i].tags);
      if (tags.length) await c.query("INSERT INTO question_practice (qkey, tags) VALUES ($1, $2)", [qkey, tags]);
    }
    return { testId, revId, at: (await c.query("UPDATE test_revisions SET updated_at = clock_timestamp() WHERE id = $1 RETURNING updated_at::text AS at", [revId])).rows[0].at as string };
  });
  try { await publish(revId, at, {}, who); }
  catch (e) { await (await conn()).query("DELETE FROM tests WHERE id = $1", [testId]); throw e; } // never leave a half-made quiz behind
  return { id: testId, count: qs.length };
}

/** The published questions of a test in the plain-text format, with `skipped` counting question types the format can't hold. */
export async function exportQuiz(testId: number) {
  const rows = (await (await conn()).query(`SELECT q.type, q.prompt_html, q.config, q.feedback_html, coalesce(p.tags, '{}') AS tags FROM test_revisions r JOIN rev_questions q ON q.revision_id = r.id LEFT JOIN question_practice p ON p.qkey = q.qkey
    WHERE r.test_id = $1 AND r.status = 'published' ORDER BY q.position, q.id`, [testId])).rows;
  const plain = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
  return formatQuestions(rows.map((r) => ({ type: r.type, prompt: plain(r.prompt_html), config: r.config, feedback: plain(r.feedback_html), tags: r.tags })));
}
