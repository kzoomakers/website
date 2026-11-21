import { conn } from "../db";
import { visibleSql, type Viewer } from "../library/rules";
import type { Block, Completion } from "./blocks";
import { lessonsOf } from "./order";
import { practiceTitles } from "./practice";
import { tx } from "./tx";
import { applyAction, continueAt, isComplete, unlockedIds, type Action, type Data } from "./progress";

// Member side of courses: what a person may see, their progress, and recording it. `preview` (staff only) shows drafts with everything unlocked and records nothing.
export type Outline = { id: number; slug: string; title: string; summary: string; sequential: boolean; change_note: string; updated_at: Date; preview: boolean;
  sections: { id: number; title: string; lessons: { id: number; title: string; done: boolean; locked: boolean }[] }[]; order: number[]; doneCount: number; next: number | null };

export async function memberCourses(v: Viewer) {
  return (await (await conn()).query(`SELECT c.id, c.slug, c.title, c.summary, count(l.id)::int AS lessons, count(p.lesson_id)::int AS done
    FROM courses c JOIN course_sections s ON s.course_id = c.id JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL
    LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = $1 AND p.state = 'done'
    WHERE c.deleted_at IS NULL AND c.status = 'published' GROUP BY c.id ORDER BY lower(c.title)`, [v.id])).rows;
}

async function load(v: Viewer, slug: string, preview: boolean) {
  const c = await conn(), draftsOk = preview && v.staff;
  const course = (await c.query(`SELECT id, slug, title, summary, sequential, change_note, updated_at FROM courses WHERE slug = $1 AND deleted_at IS NULL ${draftsOk ? "" : "AND status = 'published'"}`, [slug])).rows[0];
  if (!course) return null;
  const sections = (await c.query("SELECT id, title FROM course_sections WHERE course_id = $1 ORDER BY position, id", [course.id])).rows;
  const lessons = (await lessonsOf(c, course.id, "l.id, l.section_id, l.title")) as { id: number; section_id: number; title: string }[]; // no blocks: the outline never needs them
  const prog = new Map<number, { state: string; data: Data }>();
  if (v.id !== null && !draftsOk) for (const r of (await c.query("SELECT lesson_id, state, data FROM lesson_progress WHERE user_id = $1 AND lesson_id = ANY($2)", [v.id, lessons.map((l) => l.id)])).rows) prog.set(r.lesson_id, r);
  const order = lessons.map((l) => l.id), done = new Set(order.filter((id) => prog.get(id)?.state === "done"));
  const open = draftsOk ? new Set(order) : unlockedIds(order, done, course.sequential);
  const outline: Outline = { ...course, preview: draftsOk, order, doneCount: done.size, next: continueAt(order, done),
    sections: sections.map((s) => ({ id: s.id, title: s.title, lessons: lessons.filter((l) => l.section_id === s.id).map((l) => ({ id: l.id, title: l.title, done: done.has(l.id), locked: !open.has(l.id) })) })).filter((s) => s.lessons.length) };
  return { outline, lessons, prog, open };
}

export async function courseOutline(v: Viewer, slug: string, preview = false) { return (await load(v, slug, preview))?.outline ?? null; }

/** One lesson with its blocks and the member's data, or null if it doesn't exist or is still locked. Library documents it links to are included only when this person may see them. */
export async function lessonFor(v: Viewer, slug: string, lessonId: number, preview = false) {
  const x = await load(v, slug, preview), l = x?.lessons.find((y) => y.id === lessonId);
  if (!x || !l || !x.open.has(lessonId)) return null;
  const body = (await (await conn()).query("SELECT blocks, completion FROM lessons WHERE id = $1", [lessonId])).rows[0] as { blocks: Block[]; completion: Completion };
  const ids = body.blocks.flatMap((b) => (b.type === "doc" ? [b.docId] : []));
  const docs = ids.length ? (await (await conn()).query(`SELECT d.id, d.slug, d.title, d.pages FROM (SELECT d.*, (SELECT pages FROM lib_versions WHERE doc_id = d.id AND version = d.current_version) AS pages FROM lib_docs d) d WHERE d.id = ANY($2) AND ${visibleSql(v, "$1")}`, [v.id, ids])).rows : [];
  const quizzes = await practiceTitles(body.blocks.flatMap((b) => (b.type === "quiz" ? [b.testId] : [])));
  const i = x.outline.order.indexOf(lessonId), cur = x.prog.get(lessonId);
  return { outline: x.outline, lesson: { id: l.id, title: l.title, blocks: body.blocks, completion: body.completion }, data: (cur?.data ?? {}) as Data, complete: cur?.state === "done",
    quizzes, docs: Object.fromEntries(docs.map((d: any) => [d.id, d])), prev: x.outline.order[i - 1] ?? null, next: x.outline.order[i + 1] ?? null };
}

/** Records one member action on a lesson they may open. Returns the new state, or throws a message the member can read. One member's writes run one at a time (an advisory lock), so two quick checklist ticks can't overwrite each other. */
export async function recordProgress(userId: number, lessonId: number, a: Action) {
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lesson_progress:${userId}`]);
    const row = (await c.query(`SELECT c.id AS course_id, c.sequential, l.blocks, l.completion FROM lessons l JOIN course_sections s ON s.id = l.section_id JOIN courses c ON c.id = s.course_id
      WHERE l.id = $1 AND l.deleted_at IS NULL AND c.deleted_at IS NULL AND c.status = 'published'`, [lessonId])).rows[0];
    if (!row) throw new Error("That lesson isn't available.");
    const order = (await lessonsOf(c, row.course_id, "l.id")).map((r) => r.id as number);
    const states = (await c.query("SELECT lesson_id, state, data FROM lesson_progress WHERE user_id = $1 AND lesson_id = ANY($2)", [userId, order])).rows;
    if (!unlockedIds(order, new Set(states.filter((r) => r.state === "done").map((r) => r.lesson_id)), row.sequential).has(lessonId)) throw new Error("Finish the earlier lessons first.");
    const cur = states.find((r) => r.lesson_id === lessonId), data = applyAction(row.blocks, cur?.data ?? {}, a);
    if (!data) throw new Error("That doesn't apply to this lesson.");
    if (row.completion.rule === "quiz") { // the best finished practice score on this lesson's quiz blocks (runs finished before scores were stored don't count)
      const tests = row.blocks.flatMap((b: Block) => (b.type === "quiz" ? [b.testId] : []));
      const best = (await c.query("SELECT max((state->>'pct')::int) AS pct FROM practice_attempts WHERE user_id = $1 AND test_id = ANY($2) AND finished_at IS NOT NULL", [userId, tests])).rows[0]?.pct;
      if (best !== null && best !== undefined) data.quiz = Math.max(data.quiz ?? 0, best);
    }
    const state = cur?.state === "done" || isComplete(row.completion, row.blocks, data) ? "done" : "doing"; // finished lessons stay finished, even if the checklist changes later
    await c.query("INSERT INTO lesson_progress (user_id, lesson_id, state, data) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, lesson_id) DO UPDATE SET state = $3, data = $4, updated_at = now()", [userId, lessonId, state, JSON.stringify(data)]);
    return { state, data };
  });
}
