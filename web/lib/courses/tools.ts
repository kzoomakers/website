import { conn } from "../db";
import { learnFlags } from "../learn-flags";
import { rereadFrom, visibleSql, type Viewer } from "../library/rules";

// The tool is the hub (moodlecourseware/05): a tool links to library documents and courses, and may require the course and/or the SOP acknowledgements before its real test can start.
export const ROLES = ["manual", "sop", "safety"] as const;
export type Need = { kind: "course" | "doc"; title: string; href: string };

export async function toolLearning(toolId: number) {
  const c = await conn();
  const [docs, courses, t] = await Promise.all([
    c.query("SELECT d.id, d.title, d.tier, d.type, td.role FROM tool_docs td JOIN lib_docs d ON d.id = td.doc_id AND d.deleted_at IS NULL WHERE td.tool_id = $1 ORDER BY lower(d.title)", [toolId]),
    c.query("SELECT c.id, c.title FROM course_tools ct JOIN courses c ON c.id = ct.course_id AND c.deleted_at IS NULL WHERE ct.tool_id = $1 ORDER BY lower(c.title)", [toolId]),
    c.query("SELECT require_course, require_ack FROM tool_training WHERE tool_id = $1", [toolId]),
  ]);
  return { docs: docs.rows, courses: courses.rows, require_course: t.rows[0]?.require_course ?? false, require_ack: t.rows[0]?.require_ack ?? false };
}

export async function setToolLearning(toolId: number, b: { docs?: unknown; courseIds?: unknown; require_course?: unknown; require_ack?: unknown }) {
  const c = await (await conn()).connect();
  try {
    await c.query("BEGIN");
    if (!(await c.query("SELECT 1 FROM tools WHERE id = $1", [toolId])).rowCount) throw new Error("No such tool.");
    const docs = (Array.isArray(b.docs) ? b.docs : []).slice(0, 50).map((d: any) => ({ id: Number(d?.id), role: (ROLES as readonly string[]).includes(d?.role) ? d.role : "manual" })).filter((d) => Number.isInteger(d.id));
    const courses = (Array.isArray(b.courseIds) ? b.courseIds : []).slice(0, 20).map(Number).filter(Number.isInteger);
    await c.query("DELETE FROM tool_docs WHERE tool_id = $1", [toolId]);
    for (const d of docs) await c.query("INSERT INTO tool_docs (tool_id, doc_id, role) SELECT $1, id, $3 FROM lib_docs WHERE id = $2 AND deleted_at IS NULL ON CONFLICT DO NOTHING", [toolId, d.id, d.role]);
    await c.query("DELETE FROM course_tools WHERE tool_id = $1", [toolId]);
    for (const id of courses) await c.query("INSERT INTO course_tools (course_id, tool_id) SELECT id, $2 FROM courses WHERE id = $1 AND deleted_at IS NULL ON CONFLICT DO NOTHING", [id, toolId]);
    await c.query("INSERT INTO tool_training (tool_id, require_course, require_ack) VALUES ($1, $2, $3) ON CONFLICT (tool_id) DO UPDATE SET require_course = $2, require_ack = $3", [toolId, b.require_course === true, b.require_ack === true]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

/** What this member still has to do before the real test of these tools may start. Empty when nothing is required, or when courses/library are switched off (a requirement can't trap someone behind something they can't open).
 *  Only documents the member can already see count: an "authorized"-tier SOP is invisible to someone not yet authorized, so it could never be satisfied. */
export async function missingFor(v: Viewer, toolIds: number[]): Promise<Need[]> {
  if (v.id === null || !toolIds.length) return [];
  const c = await conn(), f = await learnFlags(), req = (await c.query("SELECT bool_or(require_course) AS course, bool_or(require_ack) AS ack FROM tool_training WHERE tool_id = ANY($1)", [toolIds])).rows[0];
  const out: Need[] = [];
  if (req?.course && f.courses) {
    const r = await c.query(`SELECT c.slug, c.title FROM courses c WHERE c.deleted_at IS NULL AND c.status = 'published' AND c.id IN (SELECT course_id FROM course_tools WHERE tool_id = ANY($2))
      AND EXISTS (SELECT 1 FROM course_sections s JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL WHERE s.course_id = c.id)
      AND EXISTS (SELECT 1 FROM course_sections s JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = $1 AND p.state = 'done' WHERE s.course_id = c.id AND p.lesson_id IS NULL)`, [v.id, toolIds]);
    out.push(...r.rows.map((x) => ({ kind: "course" as const, title: `Finish the course "${x.title}"`, href: `/members/courses/${x.slug}` })));
  }
  if (req?.ack && f.library) {
    const r = await c.query(`SELECT d.slug, d.title FROM lib_docs d WHERE d.type IN ('sop', 'safety') AND d.id IN (SELECT doc_id FROM tool_docs WHERE tool_id = ANY($2)) AND ${visibleSql(v, "$1")}
      AND NOT EXISTS (SELECT 1 FROM lib_acks a WHERE a.user_id = $1 AND a.doc_id = d.id AND a.version >= ${rereadFrom("d")})`, [v.id, toolIds]);
    out.push(...r.rows.map((x) => ({ kind: "doc" as const, title: `Read and confirm "${x.title}"`, href: `/members/library/${x.slug}` })));
  }
  return out;
}

/** For the member's tool cards: each tool's documents and courses they may open, and what is still required. */
export async function learningForMember(v: Viewer, toolIds: number[]) {
  const out = new Map<number, { docs: { slug: string; title: string; role: string }[]; courses: { slug: string; title: string; done: number; total: number }[]; need: Need[] }>();
  if (v.id === null || !toolIds.length) return out;
  const c = await conn(), f = await learnFlags();
  const [docs, courses] = await Promise.all([
    f.library || v.staff ? c.query(`SELECT td.tool_id, d.slug, d.title, td.role FROM tool_docs td JOIN lib_docs d ON d.id = td.doc_id WHERE td.tool_id = ANY($2) AND ${visibleSql(v, "$1")} ORDER BY lower(d.title)`, [v.id, toolIds]) : { rows: [] },
    f.courses || v.staff ? c.query(`SELECT ct.tool_id, c.slug, c.title, count(l.id)::int AS total, count(p.lesson_id)::int AS done FROM course_tools ct JOIN courses c ON c.id = ct.course_id AND c.deleted_at IS NULL AND c.status = 'published'
      JOIN course_sections s ON s.course_id = c.id JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = $1 AND p.state = 'done' WHERE ct.tool_id = ANY($2) GROUP BY ct.tool_id, c.id`, [v.id, toolIds]) : { rows: [] },
  ]);
  for (const id of toolIds) out.set(id, { docs: docs.rows.filter((d) => d.tool_id === id), courses: courses.rows.filter((x) => x.tool_id === id), need: await missingFor(v, [id]) });
  return out;
}

/** The same, for the tools a test covers. Called by start() before it opens its transaction, so it never holds one connection while waiting for another. */
export async function missingForTest(userId: number, testId: number) {
  const tools = (await (await conn()).query("SELECT tool_id FROM test_tools WHERE test_id = $1", [testId])).rows.map((r) => r.tool_id as number);
  return missingFor({ id: userId, member: true, staff: false }, tools);
}
