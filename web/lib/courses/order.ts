import type { Pool } from "pg";

/** A course's live lessons in the one order everything agrees on (section, then lesson): the editor, the outline, and the check that a lesson is unlocked. `cols` is a constant from the caller, never user input. */
export const lessonsOf = async (c: Pick<Pool, "query">, courseId: number, cols: string) =>
  (await c.query(`SELECT ${cols} FROM lessons l JOIN course_sections s ON s.id = l.section_id WHERE s.course_id = $1 AND l.deleted_at IS NULL ORDER BY s.position, s.id, l.position, l.id`, [courseId])).rows;
