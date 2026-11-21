import type { Pool } from "pg";

// Course tables (moodlecourseware/08). Created in P0 so later phases only add code; nothing reads them until the courses flag is on. Courses and lessons delete softly (deleted_at, 30-day recycle bin).
export async function coursesSchema(pool: Pool) {
  const q = (s: string) => pool.query(s);
  await q(`CREATE TABLE IF NOT EXISTS courses (id serial PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL, summary text NOT NULL DEFAULT '', cover_media_id int,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')), sequential boolean NOT NULL DEFAULT true, change_note text NOT NULL DEFAULT '',
    created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz)`);
  await q("CREATE TABLE IF NOT EXISTS course_sections (id serial PRIMARY KEY, course_id int NOT NULL REFERENCES courses ON DELETE CASCADE, position int NOT NULL DEFAULT 0, title text NOT NULL)");
  await q(`CREATE TABLE IF NOT EXISTS lessons (id serial PRIMARY KEY, section_id int NOT NULL REFERENCES course_sections ON DELETE CASCADE, position int NOT NULL DEFAULT 0, title text NOT NULL,
    blocks jsonb NOT NULL DEFAULT '[]', completion jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(), significant_at timestamptz, deleted_at timestamptz)`);
  await q("CREATE TABLE IF NOT EXISTS lesson_revisions (id serial PRIMARY KEY, lesson_id int NOT NULL REFERENCES lessons ON DELETE CASCADE, blocks jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now(), by text NOT NULL DEFAULT '')");
  await q("CREATE TABLE IF NOT EXISTS course_tools (course_id int NOT NULL REFERENCES courses ON DELETE CASCADE, tool_id int NOT NULL REFERENCES tools ON DELETE CASCADE, PRIMARY KEY (course_id, tool_id))");
  await q("CREATE TABLE IF NOT EXISTS lesson_progress (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, lesson_id int NOT NULL REFERENCES lessons ON DELETE CASCADE, state text NOT NULL DEFAULT 'todo' CHECK (state IN ('todo','doing','done')), data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, lesson_id))");
  await q("CREATE INDEX IF NOT EXISTS lesson_progress_lesson ON lesson_progress (lesson_id)");
  await q("ALTER TABLE tool_training ADD COLUMN IF NOT EXISTS require_course boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS require_ack boolean NOT NULL DEFAULT false");
}

/** Practice quizzes (moodlecourseware/03). Flags live beside the questions, keyed by qkey (which every revision of a question keeps), because published revisions are frozen and a tag change must not need a new revision.
 *  Practice attempts never touch attempts, certifications or tool_auths. */
export async function practiceSchema(pool: Pool) {
  const q = (s: string) => pool.query(s);
  await q("CREATE TABLE IF NOT EXISTS question_practice (qkey uuid PRIMARY KEY, tags text[] NOT NULL DEFAULT '{}', practice_ok boolean NOT NULL DEFAULT false)");
  await q("CREATE TABLE IF NOT EXISTS practice_attempts (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, test_id int NOT NULL REFERENCES tests ON DELETE CASCADE, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, state jsonb NOT NULL DEFAULT '{}')");
  await q("CREATE INDEX IF NOT EXISTS practice_attempts_user ON practice_attempts (user_id, test_id, id DESC)");
}
