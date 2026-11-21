import type { Pool } from "pg";

// Training and certification tables (see moodleplan/01-architecture-and-data-model.md). Idempotent, run from db.ts right after tool_auths exists.
// Published revisions are immutable and certification events are append-only; both are enforced here as well as in code.
export async function trainingSchema(pool: Pool) {
  const q = (s: string) => pool.query(s);
  await q("ALTER TABLE tools ADD COLUMN IF NOT EXISTS archived_at timestamptz");
  await q("CREATE TABLE IF NOT EXISTS tests (id serial PRIMARY KEY, title text NOT NULL, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), archived boolean NOT NULL DEFAULT false)");
  await q("CREATE TABLE IF NOT EXISTS test_tools (test_id int NOT NULL REFERENCES tests ON DELETE CASCADE, tool_id int NOT NULL REFERENCES tools, PRIMARY KEY (test_id, tool_id))");
  await q("CREATE INDEX IF NOT EXISTS test_tools_tool ON test_tools (tool_id)");
  await q(`CREATE TABLE IF NOT EXISTS test_revisions (id serial PRIMARY KEY, test_id int NOT NULL REFERENCES tests ON DELETE CASCADE, rev_no int NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')), change_kind text NOT NULL DEFAULT 'major' CHECK (change_kind IN ('major','minor')), change_note text NOT NULL DEFAULT '',
    intro_html text NOT NULL DEFAULT '', pass_pct int NOT NULL DEFAULT 80 CHECK (pass_pct BETWEEN 1 AND 100), time_limit_min int, max_attempts int, cooldown_hours int NOT NULL DEFAULT 0,
    shuffle_questions boolean NOT NULL DEFAULT true, shuffle_choices boolean NOT NULL DEFAULT true, pool_size int, review_mode text NOT NULL DEFAULT 'missed' CHECK (review_mode IN ('score','missed','all')),
    grace_days int NOT NULL DEFAULT 30, content_hash text NOT NULL DEFAULT '', created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    published_by text, published_at timestamptz, UNIQUE (test_id, rev_no))`);
  await q("CREATE UNIQUE INDEX IF NOT EXISTS test_revisions_one_draft ON test_revisions (test_id) WHERE status = 'draft'");
  await q("CREATE UNIQUE INDEX IF NOT EXISTS test_revisions_one_published ON test_revisions (test_id) WHERE status = 'published'");
  // The answer key lives in config and is never sent to the browser while a test is in progress.
  await q(`CREATE TABLE IF NOT EXISTS rev_questions (id serial PRIMARY KEY, revision_id int NOT NULL REFERENCES test_revisions ON DELETE CASCADE, qkey uuid NOT NULL DEFAULT gen_random_uuid(), position int NOT NULL,
    type text NOT NULL, prompt_html text NOT NULL DEFAULT '', points numeric NOT NULL DEFAULT 1 CHECK (points > 0), config jsonb NOT NULL DEFAULT '{}', feedback_html text NOT NULL DEFAULT '', required_correct boolean NOT NULL DEFAULT false)`);
  await q("CREATE INDEX IF NOT EXISTS rev_questions_rev ON rev_questions (revision_id, position)");
  // Published revisions are frozen: only their status may move on (published -> retired). A draft is free to change, including becoming published.
  await q(`CREATE OR REPLACE FUNCTION test_revisions_guard() RETURNS trigger AS $$ BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'a published revision can''t be deleted'; END IF;
      RETURN OLD;
    END IF;
    IF OLD.status <> 'draft' THEN
      IF NEW.status = 'draft' OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN RAISE EXCEPTION 'a published revision can''t go back to a draft'; END IF;
      IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN RAISE EXCEPTION 'a published revision can''t be edited'; END IF;
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql`);
  await q("DROP TRIGGER IF EXISTS test_revisions_guard ON test_revisions");
  await q("CREATE TRIGGER test_revisions_guard BEFORE UPDATE OR DELETE ON test_revisions FOR EACH ROW EXECUTE FUNCTION test_revisions_guard()");
  await q(`CREATE OR REPLACE FUNCTION rev_questions_guard() RETURNS trigger AS $$ DECLARE s text; BEGIN
    SELECT status INTO s FROM test_revisions WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
    IF s IS NOT NULL AND s <> 'draft' THEN RAISE EXCEPTION 'the questions of a published revision can''t change'; END IF; -- s is null while a draft is being deleted (cascade)
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END $$ LANGUAGE plpgsql`);
  await q("DROP TRIGGER IF EXISTS rev_questions_guard ON rev_questions");
  await q("CREATE TRIGGER rev_questions_guard BEFORE INSERT OR UPDATE OR DELETE ON rev_questions FOR EACH ROW EXECUTE FUNCTION rev_questions_guard()");
  await q(`CREATE TABLE IF NOT EXISTS attempts (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, revision_id int NOT NULL REFERENCES test_revisions,
    status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','expired','void')), preview boolean NOT NULL DEFAULT false, started_at timestamptz NOT NULL DEFAULT now(), due_at timestamptz, submitted_at timestamptz,
    seed int NOT NULL DEFAULT 0, answers jsonb NOT NULL DEFAULT '{}', per_question jsonb NOT NULL DEFAULT '{}', points numeric, max_points numeric, pct numeric, passed boolean,
    accommodation text NOT NULL DEFAULT '', ip text NOT NULL DEFAULT '', user_agent text NOT NULL DEFAULT '', voided_by text, voided_reason text)`);
  await q("ALTER TABLE attempts ADD COLUMN IF NOT EXISTS seq int NOT NULL DEFAULT 0");
  await q("CREATE INDEX IF NOT EXISTS attempts_user ON attempts (user_id, revision_id)");
  await q("CREATE UNIQUE INDEX IF NOT EXISTS attempts_one_open ON attempts (user_id, revision_id) WHERE status = 'in_progress' AND NOT preview");
  await q(`CREATE TABLE IF NOT EXISTS certifications (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, tool_id int NOT NULL REFERENCES tools,
    revision_id int REFERENCES test_revisions, attempt_id int REFERENCES attempts ON DELETE SET NULL,
    state text NOT NULL DEFAULT 'passed' CHECK (state IN ('passed','in_training','ready','certified','rejected','waived','lapsed','revoked')), signoffs_required int NOT NULL DEFAULT 1 CHECK (signoffs_required >= 1),
    source text NOT NULL DEFAULT 'test' CHECK (source IN ('test','override','legacy')), certified_at timestamptz, certified_by text, valid_until date,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await q("CREATE INDEX IF NOT EXISTS certifications_state ON certifications (state, tool_id)");
  await q("CREATE INDEX IF NOT EXISTS certifications_user ON certifications (user_id)");
  await q("CREATE UNIQUE INDEX IF NOT EXISTS certifications_one_open ON certifications (user_id, tool_id) WHERE state IN ('passed','in_training','ready')");
  await q("CREATE TABLE IF NOT EXISTS cert_events (id serial PRIMARY KEY, cert_id int NOT NULL REFERENCES certifications ON DELETE CASCADE, at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, kind text NOT NULL, note text NOT NULL DEFAULT '', shared boolean NOT NULL DEFAULT false, data jsonb)");
  await q("CREATE INDEX IF NOT EXISTS cert_events_cert ON cert_events (cert_id, at)");
  // Append-only: a note is corrected by a new note. Deletion stays possible so erasing a member (cascade) works.
  await q("CREATE OR REPLACE FUNCTION cert_events_frozen() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'cert_events is append-only'; END $$ LANGUAGE plpgsql");
  await q("DROP TRIGGER IF EXISTS cert_events_frozen ON cert_events");
  await q("CREATE TRIGGER cert_events_frozen BEFORE UPDATE ON cert_events FOR EACH ROW EXECUTE FUNCTION cert_events_frozen()");
  await q("CREATE TABLE IF NOT EXISTS cert_signoffs (cert_id int NOT NULL REFERENCES certifications ON DELETE CASCADE, trainer_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, at timestamptz NOT NULL DEFAULT now(), note text NOT NULL DEFAULT '', PRIMARY KEY (cert_id, trainer_id))");
  await q("CREATE TABLE IF NOT EXISTS tool_trainers (tool_id int NOT NULL REFERENCES tools ON DELETE CASCADE, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, added_by text NOT NULL DEFAULT '', added_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tool_id, user_id))");
  await q("CREATE INDEX IF NOT EXISTS tool_trainers_user ON tool_trainers (user_id)");
  // Per-tool settings, kept off `tools` so the Tools page stays simple. No row means the defaults.
  await q("CREATE TABLE IF NOT EXISTS tool_training (tool_id int PRIMARY KEY REFERENCES tools ON DELETE CASCADE, signoffs_required int NOT NULL DEFAULT 1 CHECK (signoffs_required BETWEEN 1 AND 5), validity_months int CHECK (validity_months BETWEEN 1 AND 120), manual_grant_allowed boolean NOT NULL DEFAULT true)");
  await q("CREATE TABLE IF NOT EXISTS rollouts (id serial PRIMARY KEY, revision_id int NOT NULL REFERENCES test_revisions, deadline date NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz)");
  await q("CREATE TABLE IF NOT EXISTS rollout_members (rollout_id int NOT NULL REFERENCES rollouts ON DELETE CASCADE, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, tool_id int NOT NULL REFERENCES tools ON DELETE CASCADE, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','satisfied','lapsed','exempt')), last_reminder_days int, notified_at timestamptz, PRIMARY KEY (rollout_id, user_id, tool_id))");
  // A rollout that would lapse more than half its people waits for a lead's confirmation (lapse_ok); guard_at is when the sweep last held it back.
  await q("ALTER TABLE rollouts ADD COLUMN IF NOT EXISTS lapse_ok boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS guard_at timestamptz, ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT ''");
  // One row per notice already sent (event + member + what it was about + day), so a retry or restart can't send it twice. pushed_at: when staff were told this pass is waiting.
  await q("CREATE TABLE IF NOT EXISTS training_mail_log (key text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())");
  await q("ALTER TABLE certifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz");
  await q("CREATE TABLE IF NOT EXISTS outbox (id serial PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('discord')), payload jsonb NOT NULL, tries int NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), last_error text NOT NULL DEFAULT '', sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())");
  // Member consent for Discord announcements: '' = no (default), 'first' = first name, 'full' = first name and Discord username.
  await q("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS discord_announce text NOT NULL DEFAULT '' CHECK (discord_announce IN ('','first','full'))");
  // Settings (on/off flag, copy, Discord webhook) live in the shared `settings` table under key "training".

  // tool_auths gains where a grant came from and the re-pass deadline. Rows that already exist were granted by hand before training: 'legacy'.
  await q("ALTER TABLE tool_auths ADD COLUMN IF NOT EXISTS cert_id int REFERENCES certifications ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS revision_id int REFERENCES test_revisions ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS retake_due_on date, ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy' CHECK (source IN ('legacy','training','override','manual'))");
  // The one definition of "expired": the earlier of the expiry date and a re-pass deadline, judged on the shop's calendar day (not the database server's).
  await q(`CREATE OR REPLACE VIEW tool_auths_effective AS SELECT a.user_id, a.tool_id, a.granted_by, a.granted_at, a.expires_on, a.note, a.cert_id, a.revision_id, a.retake_due_on, a.source, LEAST(a.expires_on, a.retake_due_on) AS effective_expiry,
    COALESCE(LEAST(a.expires_on, a.retake_due_on) < (now() AT TIME ZONE 'America/Detroit')::date, false) AS expired FROM tool_auths a`);
}
