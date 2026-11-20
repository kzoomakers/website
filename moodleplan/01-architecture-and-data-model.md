# Architecture and data model

## Where it plugs in

| Existing piece | How training uses it |
|---|---|
| `tools`, `tool_auths` (`lib/db.ts:84-87`, `lib/crm.ts:230-259`) | `tool_auths` stays the one place "is this person authorized" is answered. Training writes to it through a single function, `grantFromCert()`. |
| `lib/access.ts`, `lib/nav-manifest.ts`, `lib/guard.ts` | New section `training`, entries added to the manifest (the file's own comment: "To add a page, add a line here"). |
| `special_perms` + `canSpecial()` (`lib/guard.ts`) | Publish, override and Discord settings are special permissions. `canSpecial` is typed to two literals today; widen it. |
| `mail_queue`, `enqueueMail`, `sendQueued`, `getMailCfg` (`lib/mail.ts`) | All training emails go through the queue (retries already exist). |
| `notifyUser` (`lib/notifications.ts`) | In-app bell for the member. |
| `lib/pushover.ts` `CHANNELS`, `notify()` | New channel `training` for trainers ("3 people ready for sign-off"). |
| `lib/vault.ts` `sealText/openText` | Encrypts the Discord webhook URL at rest (it is a secret: anyone with it can post). |
| `logAudit` + `lib/audit-areas.ts` | Every state change writes an audit row; add `training.*` to the audit areas map. |
| `instrumentation.ts` `job(id, ms, fn)` with `withLock` | Lapse job, reminder job, Discord/email outbox drain. New lock ids in the 73519xx range. |
| `lib/s3.ts`, `lib/media.ts`, `lib/image.ts`, `lib/sanitize.ts` | Diagram images and rich-text prompts. |
| `lib/retention.ts` | Retention rules for attempts and certification records. |
| `special_perms`-style email lists | Not reused for per-tool trainers; see `02`. |

## Module layout (new)

```
web/lib/training/
  schema.ts        CREATE TABLE IF NOT EXISTS ... (called from db.ts the same way other tables are)
  tests.ts         tests, revisions, drafts, publish, diff
  questions.ts     question type registry + validation of a question's config
  grade.ts         pure grading functions, one per type (unit-testable without a DB)
  attempts.ts      start, autosave, submit, timer, attempt limits, cooldown
  certs.ts         certification state machine, sign-off, grant, revoke, override
  recert.ts        revision rollout, deadlines, lapse job, reminders
  notify.ts        one function per event: email + in-app + pushover + discord fan-out
  discord.ts       webhook client, embed builder, outbox
  report.ts        queue counts, pass rates, question analytics, CSV
web/app/admin/people/training/        trainer + author screens
web/app/members/training/             member Training page
web/app/api/training/                 member-facing endpoints (attempt start/save/submit)
```

Admin screens use the existing `crm()` RPC pattern (`app/admin/people/rpc.ts`) with a `training()` twin; member screens use plain route handlers like `app/api/members/*`.

## Tables

All created in `lib/training/schema.ts`, idempotent, wired from the same startup path as the others.

```sql
-- A test belongs to a tool. (test_tools join kept so one test can later cover several tools.)
tests            (id, title, created_by, created_at, archived bool)
test_tools       (test_id, tool_id, PRIMARY KEY (test_id, tool_id))

-- Immutable once published. Exactly one 'draft' per test at a time; any number 'published'/'retired'; at most one 'published' is current.
test_revisions   (id, test_id, rev_no int, status text CHECK IN ('draft','published','retired'),
                  change_kind text CHECK IN ('major','minor'), change_note text,
                  intro_html text, pass_pct int, time_limit_min int NULL,
                  max_attempts int NULL, cooldown_hours int DEFAULT 0,
                  shuffle_questions bool, shuffle_choices bool,
                  review_mode text CHECK IN ('score','missed','all'),  -- what a member sees afterwards
                  grace_days int DEFAULT 30,                           -- re-pass window if major
                  content_hash text,                                   -- tamper evidence for published revisions
                  created_by, created_at, published_by, published_at,
                  UNIQUE (test_id, rev_no))

-- Questions are copied into each revision. qkey is stable across revisions.
rev_questions    (id, revision_id, qkey uuid, position int, type text, prompt_html text,
                  points numeric DEFAULT 1, config jsonb NOT NULL,   -- includes the answer key; NEVER sent to the browser while attempting
                  feedback_html text, required_correct bool DEFAULT false)  -- "critical" questions: must be right regardless of score

attempts         (id, user_id, revision_id, status text CHECK IN ('in_progress','submitted','expired','void'),
                  started_at, due_at, submitted_at, seed int,        -- seed fixes shuffle order so reload shows the same order
                  answers jsonb, per_question jsonb,                 -- per_question: points awarded + correct/incorrect flags
                  points numeric, max_points numeric, pct numeric, passed bool,
                  accommodation text, ip inet, user_agent text, voided_by, voided_reason)

certifications   (id, user_id, tool_id, revision_id, attempt_id,
                  state text CHECK IN ('passed','in_training','ready','certified','rejected','waived','lapsed','revoked'),
                  signoffs_required int, source text CHECK IN ('test','override','legacy'),
                  certified_at, certified_by, valid_until date NULL,
                  created_at, updated_at,
                  -- one open (non-terminal) certification per member and tool
                  UNIQUE partial index on (user_id, tool_id) WHERE state IN ('passed','in_training','ready'))

cert_events      (id, cert_id, at, actor text, kind text, note text, data jsonb)   -- append-only: the audit trail and the "what they did" notes
cert_signoffs    (cert_id, trainer_id, at, note, UNIQUE (cert_id, trainer_id))    -- supports signoffs_required > 1

tool_trainers    (tool_id, user_id, added_by, added_at, PRIMARY KEY (tool_id, user_id))   -- who may review/sign off which tool

rollouts         (id, revision_id, deadline date, created_by, created_at, undone_at NULL)  -- one row per "force re-pass"
rollout_members  (rollout_id, user_id, tool_id, status text, notified_at, PRIMARY KEY (...))

training_settings (key, value jsonb)         -- enabled flag, default grace, reminder cadence, discord webhook (sealed), copy text
outbox           (id, kind text CHECK IN ('discord'), payload jsonb, tries int, next_at, last_error, sent_at)   -- Discord only; email uses mail_queue
```

### Changes to `tool_auths`

```sql
ALTER TABLE tool_auths
  ADD COLUMN cert_id int REFERENCES certifications,
  ADD COLUMN revision_id int REFERENCES test_revisions,
  ADD COLUMN retake_due_on date,                       -- set by a major revision rollout
  ADD COLUMN source text NOT NULL DEFAULT 'legacy' CHECK (source IN ('legacy','training','override','manual'));
```

"Effective expiry" is `LEAST(expires_on, retake_due_on)`. Today `authsFor()` computes `expired` from `expires_on` alone, so that expression moves into **one** SQL fragment/view (`tool_auths_effective`) used by `authsFor`, the member profile, and anything door/tool-checkout related that reads authorizations. Grep every reader before changing it (phase 0 task).

## State machines

### Attempt

```
in_progress ─► submitted (graded immediately on submit)
     │             └─► void (admin only, with reason)
     └─► expired (past due_at with no submit; graded as submitted with what was autosaved)
```

### Certification

```
        pass attempt (>= pass mark and all critical questions right)
              │
              ▼
           passed ──(trainer opens it)──► in_training ──(trainer marks ready)──► ready ──(sign-offs reach required)──► certified
              │                              │                                     │
              └──────────────► rejected ◄────┴─────────────────────────────────────┘   (member may retake: new cert)
certified ──(major revision, deadline missed)──► lapsed ──(re-pass + sign-off)──► certified
certified ──(admin)──► revoked
any open state ──(override, reason required)──► waived/certified
```

`passed` to `certified` is the only path that calls `grantFromCert()`. Override is the only other path and is separately permissioned and flagged.

### Revision

```
draft ──publish──► published ──(superseded)──► retired
```

Drafts are editable. Published revisions are immutable (enforced in code, plus `content_hash` checked on read so a manual DB edit is detectable).

## Question types (config shapes, key kept server-side)

| Type | Config (key marked ★) |
|---|---|
| `mc_single` | choices[], ★correct index |
| `mc_multi` | choices[], ★correct set, scoring `all_or_nothing` or `partial` (with penalty for wrong picks) |
| `true_false` | ★correct bool |
| `image_label` (drag name to label) | image (S3 key), drop zones[{id, x%, y%, w%, h%}], labels[{id, text}], ★zone→label map, decoys allowed |
| `match` | left[], right[], ★pairs |
| `order` | items[], ★sequence (e.g. lockout/tagout steps in order) |
| `fill_blank` (drag words into text / dropdown) | text with `{{1}}` slots, choices per slot, ★answers |
| `short_text` | ★accepted answers[] (case/space-insensitive), optional regex |
| `numeric` | ★value ± tolerance, unit optional |
| `hotspot` | image, ★region(s): "click where the E-stop is" |

Essay/manual-graded is deliberately **not** in v1: the trainer's hands-on check covers it. If wanted later, attempts gain a `needs_manual` status.

## Server rules that shape everything

- The browser gets a **sanitized question** (prompt, choices, image, zones/labels) with no key and no feedback until the review policy allows it.
- `due_at = started_at + time_limit` is set by the server; submit after `due_at + small grace` is graded as of the last autosave.
- Autosave is idempotent per attempt; the final submit grades from the **stored** answers plus the submitted ones, never from a client-reported score.
- One in-progress attempt per member per revision; starting another resumes the existing one.
- All writes check `attempts.user_id = session member`. No attempt ID is guessable-and-readable by another member.
