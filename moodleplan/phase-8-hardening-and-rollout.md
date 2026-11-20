# Phase 8: hardening and rollout

## Security review

Run the `owasp-security` and `security-review` skills over the whole feature before turning it on. Specific checks:

- **Authorization**: every route and RPC re-checks identity, section/page level, `tool_trainers` scope, and ownership (member only touches own attempts). Walk the permission matrix test in `02`.
- **Answer-key exposure**: automated test hitting every member endpoint in every state and grepping responses for key fields.
- **IDOR**: attempt, cert, rollout and note IDs are not enough to read others' data.
- **Input**: rich text sanitized, image upload validated, JSON size caps, question count caps, regex questions are length-limited and run with a timeout (ReDoS), CSV import capped.
- **SSRF**: webhook host allow-list; image fetches never from user URLs.
- **CSRF**: follow the existing pattern used by the admin RPC and member POST routes.
- **Secrets**: webhook sealed; not in logs, `httplog` entries (check `lib/httplog-*` redaction), or error messages.
- **Rate limits**: `lib/limit.ts` on start/save/submit and on any export.
- **Audit**: every mutation writes one.
- **Privacy**: retention and erase/export implemented and tested (`03`).

## Test suite targets

- Unit: every question type's `validate/toMember/grade`; state machine; date maths (grace, DST, time zone).
- DB-backed (pattern `feed-*-db.test.mjs`): migrations idempotent, transitions, rollouts, lapse sweep, immutability trigger, unique partial index, concurrent sign-off.
- E2E (browser, via the Chrome tooling): build a test with a diagram, take it on a phone-sized viewport, pass, sign off as trainer, see the Discord post (against a test channel) and emails (against a mail sink).
- Load: 50 members submitting at once; lapse sweep over a few thousand rows.

## Rollout order

1. Merge phases 0 to 2 with `training_enabled = off`. Build real tests in production as drafts. Invisible to members.
2. **Pilot**: enable for one low-risk tool and 3 to 5 members + 1 trainer. Fix confusion.
3. Merge phase 3 and enable for a few tools. Run real sign-offs. Phase 5 email on before this, or trainers won't know anyone is waiting.
4. Enable for all tools gradually by shop (wood, metal, laser…). Announce in the newsletter and Discord with a how-to page in the handbook.
5. Phase 4 **after** the first real revision is needed, not before: don't force re-passes during the learning period. First rollout uses a long grace period and is previewed with the lead.
6. Phase 6 Discord last, after members have had a chance to opt in; announce the opt-in first.

## Data migration

- Existing `tool_auths` untouched (`source='legacy'`).
- No back-filled certifications: legacy people simply have an authorization without a cert, shown as "Authorized (before training records)". Their member file offers "credit prior certification" to attach a date and trainer if the club knows it.
- Seed `tool_training` rows (defaults) for every tool; seed trainers from whoever currently grants sign-offs, by reading `tool_auths.granted_by` frequency per tool as a **suggestion list** for the lead (not auto-assigned).

## Documentation

- Handbook section for members: how to take a test, what happens next, retake rules, Discord opt-in, privacy.
- Trainer guide: queue, notes, sign-off, what to record.
- Author guide: building questions, the diagram tool, major vs minor, change notes.
- Lead runbook: rollouts, undo, overrides, regrade, "what to do if…" (webhook down, mail down, wrong key, mass lapse).
- Admin help text inline on each page (the site's pages already use `.sub` help lines).

## Operations

- Health: Settings page shows last run of each job (sweep, reminders, outbox) and queue depths; alert (Pushover) if the sweep hasn't run in 3 hours.
- Backups: tests and certifications are in Postgres; images in S3 (already backed up with the rest). Test export to JSON from phase 1 is the portable copy.
- Kill switch: `training_enabled` off hides member pages and stops emails, Discord and lapses; **does not** touch existing `tool_auths`.
- Metrics to watch the first month: queue wait time, pass rate per test, failed-send counts, support questions.

## Exit criteria for the whole project

- No member can gain an authorization without a sign-off or a logged override.
- No member can lose one by accident: every lapse is traceable, previewed, reversible.
- A new trainer can be onboarded from the docs alone.
- The lead can answer "who is certified on the laser, by whom, on which revision, and what did we do with them?" in one screen.
