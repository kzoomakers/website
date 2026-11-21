# Phase 2: member Training page and taking tests

Members see what they can take, take it, and see the result. A pass creates a certification in `passed` state (the queue in phase 3 picks it up). No authorization is granted yet.

## Member Training page: `/members/training`

Sections (one card per tool, grouped by `tools.category` like the Tools page):

| State shown | Meaning | Action |
|---|---|---|
| Not started | Tool has a published test | **Take the test** |
| In progress | Attempt open | **Resume** (shows time left) |
| Cooldown | Failed recently | "You can retry in 3h" |
| Locked | Prerequisite missing | Names the prerequisite |
| Passed, awaiting trainer | Cert `passed`/`in_training`/`ready` | Who the trainers are, how to contact them |
| Certified | `tool_auths` row active | Date, certified by (if trainer opts to show), valid until |
| Re-pass due | Major revision deadline set | "Retake by Dec 20 to keep your authorization" |
| Lapsed | Deadline missed | Retake CTA |
| No test yet | Tool has none | "Ask a trainer" (read-only) |

Also: my attempt history, with review according to the revision's `review_mode`.

Link it from the members menu and from the profile page (which already lists authorizations via `authsFor`).

## Attempt engine (`lib/training/attempts.ts`, `app/api/training/*`)

```
POST /api/training/start     { testId }      -> attempt id, member-view questions, due_at
PUT  /api/training/save      { attemptId, answers, seq }   autosave, idempotent
POST /api/training/submit    { attemptId, answers }        grades server-side, returns result
GET  /api/training/attempt/:id                              resume / review (policy-filtered)
```

Rules:

- **Eligibility check on start**: approved member and not disabled (`site_users.disabled_at` is null), flag on, a published revision exists, not at `max_attempts`, cooldown passed, prerequisites met (`tool_prereqs`, see 01), no other in-progress attempt (resume instead), not already certified (unless a re-pass is due).
- **Server clock owns time**: `due_at` is set at start; the client countdown is cosmetic. Submit after `due_at` plus 30s grace is graded from the last autosave and the attempt is marked `expired`.
- **Draw and order**: question pool draw and shuffles come from `seed` stored on the attempt, so a reload shows the same thing and a retry gets a new seed.
- **Autosave** every few seconds and on change; `seq` number rejects out-of-order saves.
- **Grading** loads the key from `rev_questions.config` on the server, runs `grade()` per question, stores `per_question`, totals, `pct`, `passed` (pct >= pass mark **and** every critical question correct).
- **Result** page: score, pass/fail, per-question feedback per `review_mode` (`score` only, `missed` shows which, `all` shows correct answers). Default to `missed` without revealing keys, so a failed attempt can't be used to farm the key. Document this tradeoff in the settings help text.
- **On pass**: in one transaction, create one certification per tool on the test (`state='passed'`, `signoffs_required` from `tool_training`, `revision_id`, `attempt_id`), skipping any tool that already has an open one; emit `attempt.passed`. If the tool's `tool_training.signoff_mode` is `auto`, go straight to `certified` through `grantFromCert()` (same code path, no shortcut).
- **On fail**: emit `attempt.failed`; apply cooldown; after the Nth failure set `needs_unlock` so only a trainer can allow more attempts.
- **Abuse limits**: reuse `lib/limit.ts` for per-member and per-IP rate limiting on start/save/submit; payload size caps; max questions per test.

## Taking UI

- One question per screen or all on one page (setting per test); progress indicator; flag-for-review; unanswered warning on submit.
- Warn before leaving the page; resume cleanly after closing the tab.
- Works on a phone; all drag types have the click/keyboard alternatives from phase 1.
- Optional: a hard warning that the test is monitored and answers are logged; no proctoring.

## Accommodations

`training_accommodations` (see 01) is read when an attempt starts. The multiplier and read-aloud flag are copied onto the attempt (`attempts.time_multiplier`, `attempts.read_aloud`), so later changes never rewrite history. `due_at = started_at + time_limit × time_multiplier`. Set by trainers in phase 3's member file.

## Tests

- Grade integration test: start, save, submit, assert stored result.
- Timer: submit after `due_at` is graded from autosave only.
- Forgery: client posting `passed: true` or a score is ignored; another member's `attemptId` returns 404.
- Answer-key leakage test on every API response (start, resume, result by `review_mode`).
- Two tabs, two starts: second resumes the first.
- Concurrency: double-submit grades once, creates one certification.
- Cooldown, max attempts, prerequisites, flag off, disabled member, multi-tool pass (one certification per tool, an existing open one is skipped).

## Done when

A real member, on a phone, can take a mixed test with a diagram, lose connection and resume, pass, and see "awaiting trainer"; a certification row in `passed` exists; no `tool_auths` row was created.
