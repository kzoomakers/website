import { conn } from "../db";
import { slugify } from "../library/rules";
import { cleanBlocks, cleanCompletion, lessonProblems } from "./blocks";

// Course, section and lesson editing (admin side). Courses and lessons delete softly. Positions are renumbered 1..n, and "move" swaps neighbours (the non-drag path).
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export const listCourses = async (trash = false) => (await (await conn()).query(`SELECT c.id, c.slug, c.title, c.summary, c.status, c.updated_at,
  (SELECT count(*)::int FROM course_sections s JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL WHERE s.course_id = c.id) AS lessons
  FROM courses c WHERE c.deleted_at IS ${trash ? "NOT NULL AND c.deleted_at > now() - interval '30 days'" : "NULL"} ORDER BY lower(c.title)`)).rows;

/** A course with its sections and lessons (blocks included: this is the editor's view, so it is staff only). */
export async function getCourse(id: number) {
  const c = await conn(), course = (await c.query("SELECT id, slug, title, summary, status, sequential, change_note FROM courses WHERE id = $1 AND deleted_at IS NULL", [id])).rows[0];
  if (!course) throw new Error("That course doesn't exist.");
  const sections = (await c.query("SELECT id, title, position FROM course_sections WHERE course_id = $1 ORDER BY position, id", [id])).rows;
  const lessons = (await c.query("SELECT l.id, l.section_id, l.title, l.position, l.blocks, l.completion, l.significant_at FROM lessons l JOIN course_sections s ON s.id = l.section_id WHERE s.course_id = $1 AND l.deleted_at IS NULL ORDER BY l.position, l.id", [id])).rows;
  return { ...course, sections: sections.map((s) => ({ ...s, lessons: lessons.filter((l) => l.section_id === s.id).map((l) => ({ ...l, problems: lessonProblems(l.title, l.blocks, l.completion) })) })) };
}

export async function createCourse(title: unknown, who: string) {
  const t = clean(title, 120), c = await conn();
  if (!t) throw new Error("Give the course a title.");
  const base = slugify(t);
  let slug = base;
  for (let i = 2; (await c.query("SELECT 1 FROM courses WHERE slug = $1", [slug])).rowCount; i++) slug = `${base}-${i}`;
  const id = (await c.query("INSERT INTO courses (slug, title, created_by) VALUES ($1, $2, $3) RETURNING id", [slug, t, who])).rows[0].id;
  await c.query("INSERT INTO course_sections (course_id, position, title) VALUES ($1, 1, 'Getting started')", [id]);
  return { id };
}

export async function editCourse(id: number, b: { title?: unknown; summary?: unknown; status?: unknown; sequential?: unknown; change_note?: unknown }) {
  const sets: string[] = [], vals: unknown[] = [], put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (typeof b.title === "string") { if (!b.title.trim()) throw new Error("Give the course a title."); put("title", clean(b.title, 120)); }
  if (typeof b.summary === "string") put("summary", clean(b.summary, 1000));
  if (typeof b.change_note === "string") put("change_note", clean(b.change_note, 300));
  if (typeof b.sequential === "boolean") put("sequential", b.sequential);
  if (b.status !== undefined) {
    if (!["draft", "published", "archived"].includes(b.status as string)) throw new Error("Unknown status.");
    if (b.status === "published") {
      const empty = (await (await conn()).query("SELECT NOT EXISTS (SELECT 1 FROM course_sections s JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL WHERE s.course_id = $1) AS e", [id])).rows[0].e;
      if (empty) throw new Error("Add at least one lesson before publishing.");
    }
    put("status", b.status);
  }
  if (!sets.length) return;
  vals.push(id);
  await (await conn()).query(`UPDATE courses SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} AND deleted_at IS NULL`, vals);
}
export const deleteCourse = async (id: number) => { await (await conn()).query("UPDATE courses SET deleted_at = now(), status = 'draft' WHERE id = $1 AND deleted_at IS NULL", [id]); };
export const restoreCourse = async (id: number) => { await (await conn()).query("UPDATE courses SET deleted_at = NULL WHERE id = $1 AND deleted_at > now() - interval '30 days'", [id]); };

export async function addSection(courseId: number, title: unknown) {
  const t = clean(title, 120);
  if (!t) throw new Error("Give the section a title.");
  await (await conn()).query("INSERT INTO course_sections (course_id, title, position) SELECT $1, $2, coalesce(max(position), 0) + 1 FROM course_sections WHERE course_id = $1", [courseId, t]);
}
export async function renameSection(id: number, title: unknown) {
  const t = clean(title, 120);
  if (!t) throw new Error("Give the section a title.");
  await (await conn()).query("UPDATE course_sections SET title = $2 WHERE id = $1", [id, t]);
}
export async function deleteSection(id: number) {
  const c = await conn();
  if ((await c.query("SELECT 1 FROM lessons WHERE section_id = $1 AND deleted_at IS NULL", [id])).rowCount) throw new Error("Delete or move this section's lessons first.");
  await c.query("DELETE FROM course_sections WHERE id = $1", [id]);
}

export async function addLesson(sectionId: number, title: unknown) {
  const t = clean(title, 120);
  if (!t) throw new Error("Give the lesson a title.");
  if (!(await (await conn()).query("INSERT INTO lessons (section_id, title, position) SELECT $1, $2, coalesce(max(position), 0) + 1 FROM lessons WHERE section_id = $1 RETURNING id", [sectionId, t])).rowCount) throw new Error("Failed.");
}
export const deleteLesson = async (id: number) => { await (await conn()).query("UPDATE lessons SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]); };

/** Saves a lesson (autosave and the Save button): cleans every block, keeps the previous blocks as a revision, and returns what to fix. `significant` marks a safety-relevant change. */
export async function saveLesson(id: number, b: { title?: unknown; blocks?: unknown; completion?: unknown; significant?: unknown }, who: string) {
  const c = await conn(), cur = (await c.query("SELECT title, blocks FROM lessons WHERE id = $1 AND deleted_at IS NULL", [id])).rows[0];
  if (!cur) throw new Error("That lesson doesn't exist.");
  const title = typeof b.title === "string" && b.title.trim() ? clean(b.title, 120) : cur.title, { blocks, dropped } = cleanBlocks(b.blocks ?? cur.blocks), completion = cleanCompletion(b.completion);
  if (JSON.stringify(cur.blocks) !== JSON.stringify(blocks)) await c.query("INSERT INTO lesson_revisions (lesson_id, blocks, by) VALUES ($1, $2, $3)", [id, JSON.stringify(cur.blocks), who]);
  await c.query("UPDATE lessons SET title = $2, blocks = $3, completion = $4, updated_at = now(), significant_at = CASE WHEN $5 THEN now() ELSE significant_at END WHERE id = $1", [id, title, JSON.stringify(blocks), JSON.stringify(completion), b.significant === true]);
  return { blocks, completion, dropped, problems: lessonProblems(title, blocks, completion) };
}

/** Moves a section or lesson one place up or down among its siblings. */
export async function move(kind: "section" | "lesson", id: number, dir: unknown) {
  const [t, parent, where] = kind === "section" ? ["course_sections", "course_id", ""] : ["lessons", "section_id", "AND deleted_at IS NULL"], c = await conn();
  const sibs = (await c.query(`SELECT id FROM ${t} WHERE ${parent} = (SELECT ${parent} FROM ${t} WHERE id = $1) ${where} ORDER BY position, id`, [id])).rows.map((r) => r.id as number);
  const i = sibs.indexOf(id), j = i + (dir === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  await c.query(`UPDATE ${t} SET position = x.p FROM (SELECT id, ord::int AS p FROM unnest($1::int[]) WITH ORDINALITY AS u(id, ord)) x WHERE ${t}.id = x.id`, [sibs]);
}

/** Library documents an author can link a lesson to (published, newest title order). Lessons store only the id, so a new version shows up automatically. */
export const docChoices = async () => (await (await conn()).query("SELECT id, title FROM lib_docs WHERE deleted_at IS NULL AND status = 'published' ORDER BY lower(title) LIMIT 500")).rows;
