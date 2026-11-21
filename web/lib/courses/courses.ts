import { conn } from "../db";
import { slugify } from "../library/rules";
import { cleanBlocks, cleanCompletion, lessonProblems } from "./blocks";
import { lessonsOf } from "./order";
import { tx } from "./tx";

// Course, section and lesson editing (admin side). Courses and lessons delete softly (30 days, then the retention job removes them). Positions are renumbered 1..n, and "move" swaps neighbours (the non-drag path).
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
export const MAX_SECTIONS = 50, MAX_LESSONS = 100, MAX_LESSON_BYTES = 1_000_000, KEEP_REVISIONS = 20;

export const listCourses = async (trash = false) => (await (await conn()).query(`SELECT c.id, c.slug, c.title, c.summary, c.status, c.updated_at,
  (SELECT count(*)::int FROM course_sections s JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL WHERE s.course_id = c.id) AS lessons
  FROM courses c WHERE c.deleted_at IS ${trash ? "NOT NULL AND c.deleted_at > now() - interval '30 days'" : "NULL"} ORDER BY lower(c.title)`)).rows;

/** The editor's outline: sections and lessons with what is wrong with each, but not the blocks (those load one lesson at a time, see getLesson). */
export async function getCourse(id: number) {
  const c = await conn(), course = (await c.query("SELECT id, slug, title, summary, status, sequential, change_note FROM courses WHERE id = $1 AND deleted_at IS NULL", [id])).rows[0];
  if (!course) throw new Error("That course doesn't exist.");
  const sections = (await c.query("SELECT id, title, position FROM course_sections WHERE course_id = $1 ORDER BY position, id", [id])).rows;
  const lessons = await lessonsOf(c, id, "l.id, l.section_id, l.title, l.position, l.blocks, l.completion, l.significant_at");
  const trashed = (await c.query("SELECT l.id, l.title FROM lessons l JOIN course_sections s ON s.id = l.section_id WHERE s.course_id = $1 AND l.deleted_at > now() - interval '30 days' ORDER BY l.deleted_at DESC", [id])).rows;
  return { ...course, trashed, sections: sections.map((s) => ({ ...s, lessons: lessons.filter((l) => l.section_id === s.id).map(({ blocks, ...l }) => ({ ...l, problems: lessonProblems(l.title, blocks, l.completion) })) })) };
}
export async function getLesson(id: number) {
  const l = (await (await conn()).query("SELECT id, title, blocks, completion FROM lessons WHERE id = $1 AND deleted_at IS NULL", [id])).rows[0];
  if (!l) throw new Error("That lesson doesn't exist.");
  return l;
}

export async function createCourse(title: unknown, who: string) {
  const t = clean(title, 120), c = await conn();
  if (!t) throw new Error("Give the course a title.");
  const base = slugify(t);
  for (let i = 1; ; i++) {
    try { // one statement, so a course never exists without its first section; a taken slug (even one taken a moment ago) just tries the next
      return { id: (await c.query("WITH c AS (INSERT INTO courses (slug, title, created_by) VALUES ($1, $2, $3) RETURNING id) INSERT INTO course_sections (course_id, position, title) SELECT id, 1, 'Getting started' FROM c RETURNING course_id AS id", [i === 1 ? base : `${base}-${i}`, t, who])).rows[0].id as number };
    } catch (e: any) { if (e.code !== "23505" || i > 50) throw e; }
  }
}

export async function editCourse(id: number, b: { title?: unknown; summary?: unknown; status?: unknown; sequential?: unknown; change_note?: unknown }) {
  const sets: string[] = [], vals: unknown[] = [], put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (typeof b.title === "string") { if (!b.title.trim()) throw new Error("Give the course a title."); put("title", clean(b.title, 120)); }
  if (typeof b.summary === "string") put("summary", clean(b.summary, 1000));
  if (typeof b.change_note === "string") put("change_note", clean(b.change_note, 300));
  if (typeof b.sequential === "boolean") put("sequential", b.sequential);
  if (b.status !== undefined) {
    if (!["draft", "published", "archived"].includes(b.status as string)) throw new Error("Unknown status.");
    if (b.status === "published") { // a lesson no member could ever finish would also lock them out of any test that requires the course
      const lessons = await lessonsOf(await conn(), id, "l.title, l.blocks, l.completion");
      if (!lessons.length) throw new Error("Add at least one lesson before publishing.");
      const bad = lessons.map((l) => ({ t: l.title, p: lessonProblems(l.title, l.blocks, l.completion) })).filter((x) => x.p.length);
      if (bad.length) throw new Error(`Fix these before publishing: ${bad.slice(0, 5).map((x) => `"${x.t || "(untitled)"}": ${x.p.join(" ")}`).join(" ")}`);
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
  const t = clean(title, 120), c = await conn();
  if (!t) throw new Error("Give the section a title.");
  if ((await c.query("SELECT count(*)::int AS n FROM course_sections WHERE course_id = $1", [courseId])).rows[0].n >= MAX_SECTIONS) throw new Error(`A course can have at most ${MAX_SECTIONS} sections.`);
  await c.query("INSERT INTO course_sections (course_id, title, position) SELECT $1, $2, coalesce(max(position), 0) + 1 FROM course_sections WHERE course_id = $1", [courseId, t]);
}
export async function renameSection(id: number, title: unknown) {
  const t = clean(title, 120);
  if (!t) throw new Error("Give the section a title.");
  await (await conn()).query("UPDATE course_sections SET title = $2 WHERE id = $1", [id, t]);
}
/** Only an empty section goes. Lessons already in the recycle bin are removed with it (the editor says so), because the database deletes a section's lessons with it. */
export async function deleteSection(id: number) {
  const c = await conn();
  if ((await c.query("SELECT 1 FROM lessons WHERE section_id = $1 AND deleted_at IS NULL", [id])).rowCount) throw new Error("Delete or move this section's lessons first.");
  await c.query("DELETE FROM course_sections WHERE id = $1", [id]);
}

export async function addLesson(sectionId: number, title: unknown) {
  const t = clean(title, 120), c = await conn();
  if (!t) throw new Error("Give the lesson a title.");
  if (!(await c.query("SELECT 1 FROM course_sections WHERE id = $1", [sectionId])).rowCount) throw new Error("That section doesn't exist.");
  if ((await c.query("SELECT count(*)::int AS n FROM lessons WHERE section_id = $1 AND deleted_at IS NULL", [sectionId])).rows[0].n >= MAX_LESSONS) throw new Error(`A section can have at most ${MAX_LESSONS} lessons.`);
  await c.query("INSERT INTO lessons (section_id, title, position) SELECT $1, $2, coalesce(max(position), 0) + 1 FROM lessons WHERE section_id = $1", [sectionId, t]);
}
export const deleteLesson = async (id: number) => { await (await conn()).query("UPDATE lessons SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]); };
/** Brings a lesson back from the recycle bin (30 days), at the end of its section. */
export async function restoreLesson(id: number) {
  const r = await (await conn()).query("UPDATE lessons l SET deleted_at = NULL, position = (SELECT coalesce(max(x.position), 0) + 1 FROM lessons x WHERE x.section_id = l.section_id) WHERE l.id = $1 AND l.deleted_at > now() - interval '30 days'", [id]);
  if (!r.rowCount) throw new Error("That lesson can't be restored.");
}

/** Saves a lesson (autosave and the Save button): cleans every block, keeps the previous blocks as a revision (the newest 20), and returns what to fix. `significant` marks a safety-relevant change. */
export async function saveLesson(id: number, b: { title?: unknown; blocks?: unknown; completion?: unknown; significant?: unknown }, who: string) {
  const c = await conn(), cur = (await c.query("SELECT title, blocks FROM lessons WHERE id = $1 AND deleted_at IS NULL", [id])).rows[0];
  if (!cur) throw new Error("That lesson doesn't exist.");
  const title = typeof b.title === "string" && b.title.trim() ? clean(b.title, 120) : cur.title, { blocks, dropped } = cleanBlocks(b.blocks ?? cur.blocks), completion = cleanCompletion(b.completion);
  const json = JSON.stringify(blocks);
  if (json.length > MAX_LESSON_BYTES) throw new Error("This lesson is too big to save. Split it into two lessons.");
  if (JSON.stringify(cur.blocks) !== json) {
    await c.query("INSERT INTO lesson_revisions (lesson_id, blocks, by) VALUES ($1, $2, $3)", [id, JSON.stringify(cur.blocks), who]);
    await c.query("DELETE FROM lesson_revisions WHERE lesson_id = $1 AND id NOT IN (SELECT id FROM lesson_revisions WHERE lesson_id = $1 ORDER BY id DESC LIMIT $2)", [id, KEEP_REVISIONS]);
  }
  await c.query("UPDATE lessons SET title = $2, blocks = $3, completion = $4, updated_at = now(), significant_at = CASE WHEN $5 THEN now() ELSE significant_at END WHERE id = $1", [id, title, json, JSON.stringify(completion), b.significant === true]);
  return { title, blocks, completion, dropped, problems: lessonProblems(title, blocks, completion) };
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

/** Library documents an author can link a lesson to. Titles of staff-only and authorized-only documents are shown only to people who also have library access (`all`). */
export const docChoices = async (all: boolean) => (await (await conn()).query(`SELECT id, title FROM lib_docs WHERE deleted_at IS NULL AND status = 'published' ${all ? "" : "AND tier IN ('members', 'public')"} ORDER BY lower(title) LIMIT 500`)).rows;

/** Retention: course and lesson recycle bins after 30 days, practice runs after 12 months. A course takes its sections, lessons, revisions and progress with it. */
export async function purgeLearning() {
  const c = await conn();
  await c.query("DELETE FROM courses WHERE deleted_at < now() - interval '30 days'");
  await c.query("DELETE FROM lessons WHERE deleted_at < now() - interval '30 days'");
  await c.query("DELETE FROM practice_attempts WHERE started_at < now() - interval '12 months'");
}

// ---- Export, import, duplicate ----
// A course as plain JSON: content only (no progress, no status, no tool links). Library documents and quizzes are referenced by id, so on another site those blocks show "not available" until relinked.
export const MAX_IMPORT_BYTES = 2_000_000;
export async function exportCourse(id: number) {
  const c = await getCourse(id), ls = await lessonsOf(await conn(), id, "l.id, l.section_id, l.title, l.blocks, l.completion");
  return { format: "kzoo-course", version: 1, title: c.title, summary: c.summary, sequential: c.sequential,
    sections: c.sections.map((s: any) => ({ title: s.title, lessons: ls.filter((l) => l.section_id === s.id).map((l) => ({ title: l.title, blocks: l.blocks, completion: l.completion })) })) };
}

/** Creates a draft course from exported JSON. Every block goes through the same cleaning as a save; the counts are capped like the editor's. Returns the new id and how many blocks were left out. */
export async function importCourse(data: any, who: string, titleOverride?: string) {
  if (data?.format !== "kzoo-course" || data.version !== 1 || !Array.isArray(data.sections)) throw new Error("That isn't a course export file.");
  const title = clean(titleOverride ?? data.title, 120);
  if (!title) throw new Error("The course needs a title.");
  if (data.sections.length > MAX_SECTIONS) throw new Error(`A course can have at most ${MAX_SECTIONS} sections.`);
  let dropped = 0;
  const sections = data.sections.map((s: any) => {
    const lessons = Array.isArray(s?.lessons) ? s.lessons : [];
    if (lessons.length > MAX_LESSONS) throw new Error(`A section can have at most ${MAX_LESSONS} lessons.`);
    return { title: clean(s?.title, 120) || "Section", lessons: lessons.map((l: any) => {
      const { blocks, dropped: d } = cleanBlocks(l?.blocks); dropped += d;
      if (JSON.stringify(blocks).length > MAX_LESSON_BYTES) throw new Error("A lesson in this file is too big.");
      return { title: clean(l?.title, 120) || "Lesson", blocks, completion: cleanCompletion(l?.completion) };
    }) };
  });
  const id = await tx(async (c) => {
    const base = slugify(title), taken = new Set((await c.query("SELECT slug FROM courses WHERE slug = $1 OR slug LIKE $2", [base, `${base}-%`])).rows.map((r) => r.slug as string));
    let slug = base; for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    const cid = (await c.query("INSERT INTO courses (slug, title, summary, sequential, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [slug, title, clean(data.summary, 1000), data.sequential !== false, who])).rows[0].id as number;
    for (const [i, s] of (sections.length ? sections : [{ title: "Getting started", lessons: [] }]).entries()) {
      const sid = (await c.query("INSERT INTO course_sections (course_id, position, title) VALUES ($1,$2,$3) RETURNING id", [cid, i + 1, s.title])).rows[0].id as number;
      for (const [j, l] of s.lessons.entries()) await c.query("INSERT INTO lessons (section_id, position, title, blocks, completion) VALUES ($1,$2,$3,$4,$5)", [sid, j + 1, l.title, JSON.stringify(l.blocks), JSON.stringify(l.completion)]);
    }
    return cid;
  });
  return { id, dropped };
}
export const duplicateCourse = async (id: number, who: string) => { const x = await exportCourse(id); return importCourse(x, who, `Copy of ${x.title}`.slice(0, 120)); };
