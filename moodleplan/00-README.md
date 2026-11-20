# Training & Tool Certification: plan

Goal: members take a test for a piece of equipment, a trainer reviews the pass and signs them off, and only then does the member receive the **Tool authorization** (the existing `tool_auths` row). Tests are authored as drafts, versioned by revision, and a new revision can force everyone to re-pass or lose the authorization after a grace period. Everything is audited, emailed, and optionally announced in Discord.

This is a **re-implementation of the ideas** in Moodle's quiz module, not a port of its code (see Licensing in `03-gaps-and-considerations.md`). Moodle is a reference for question-type behaviour only.

## Files

| File | What it holds |
|---|---|
| `00-README.md` | This file: scope, decisions, phase map, risks |
| `01-architecture-and-data-model.md` | Tables, state machines, module layout, what gets refactored |
| `02-rbac-and-roles.md` | New permission section, special permissions, per-tool trainers, separation of duties |
| `03-gaps-and-considerations.md` | Things not in the original ask, licensing, privacy, accessibility, edge cases |
| `phase-0-foundations.md` | Refactors, schema, permissions, nav: no user-visible feature yet |
| `phase-1-test-builder.md` | Question types, draft/revision authoring, preview |
| `phase-2-taking-tests.md` | Member Training page, attempt engine, grading |
| `phase-3-certification-queue.md` | Admin > People > Training: review, notes, sign-off, grant |
| `phase-4-revisions-and-recert.md` | Forced re-pass, grace period, lapse, reminders |
| `phase-5-email-and-notifications.md` | Outbound email, in-app, Pushover to trainers |
| `phase-6-discord.md` | Webhook announcements and congratulations |
| `phase-7-overrides-and-reporting.md` | Manual advance/waive, reports, question analytics, exports |
| `phase-8-hardening-and-rollout.md` | Tests, security review, grandfathering, launch, docs |

## Decisions already made (from the request)

1. A test belongs to a **tool**. Passing it does **not** grant the authorization; it puts the member in a trainer's queue.
2. The authorization is granted only on **trainer sign-off**, which records notes, the extra training done, and the date.
3. Tests are **drafts first**; publishing creates an immutable **revision**.
4. A new revision can **force a re-pass**. Not passing within **30 days** (configurable) lapses the authorization.
5. Question types: multiple choice and **drag label onto diagram**, plus the other Moodle staples (see phase 1).
6. Email for every step, Discord webhook for "newly certified" announcements.
7. A trainer/admin can **manually advance** anyone past any step, with a recorded reason.
8. New roles and RBAC.

## Decisions I'm making unless you object

| Decision | Why |
|---|---|
| Training pages live at `/admin/people/training/*` but belong to a **new permission section `training`** | Same pattern `membership-classes` uses (`section: "system"` under the People tab). Keeps People's permission untouched. |
| New code lives in `web/lib/training/` (several small files), not one more 1000-line file in `lib/` | `crm.ts` and `db.ts` are already the dumping grounds the reorg plan complains about. |
| Questions are **copied into each revision** (copy-on-write), with a stable `qkey` across revisions | A published revision never changes underneath old attempts; analytics still follow a question across revisions. |
| Correct answers **never leave the server** while a test is in progress | Grading is server-side only. |
| `tool_auths` stays the single source of "is authorized"; it gains columns, and one SQL helper defines "effective" | Door/other consumers keep working; no second source of truth. |
| Each revision is flagged **major** (forces re-pass) or **minor** (typo, no re-pass) | Otherwise fixing a typo would put everyone on a 30-day clock. |
| Discord announcements are **opt-in per member** | A name in a public channel is personal data. |
| Existing authorizations are **grandfathered** (`source = 'legacy'`), not forced through tests on day one | Otherwise launch day lapses every current authorization. Retake is only forced by a later major revision, and admins can choose to include legacy people. |

## Phase map

```
P0 foundations ─► P1 builder ─► P2 taking ─► P3 queue & sign-off ─┬─► P4 revisions/recert
                                                                  ├─► P5 email/notify
                                                                  └─► P6 discord
                                                         P3..P6 ─► P7 overrides/reporting ─► P8 hardening/rollout
```

Each phase ships behind a flag (`training_enabled` setting) and is its own PR, like the admin reorg phases (#210 to #212). P3 is the first point at which authorizations can actually be granted by this system, so P0 to P2 are safe to merge to production early.

| Phase | Ships | Rough size |
|---|---|---|
| 0 | schema, permission section, nav, refactor `tools`/`tool_auths` code out of `crm.ts` | S |
| 1 | test builder | L |
| 2 | member taking + grading | L |
| 3 | trainer queue + sign-off + grant | M |
| 4 | revisions force re-pass, lapse job | M |
| 5 | email + in-app + Pushover | M |
| 6 | Discord | S |
| 7 | overrides, reports, analytics | M |
| 8 | tests, review, rollout | M |

## Top risks

1. **Answer leakage / cheating**: key in the client payload, or attempt state trusted from the browser. Mitigation: server-only grading, server-side timer (`due_at`), see phase 2.
2. **Lapse job locking people out by mistake** (bad revision flagged major, clock bug). Mitigation: dry-run preview with counts before publish, a one-click "undo this revision's deadline", all lapses reversible, trainers notified before and after.
3. **Drag-and-drop accessibility**: a mouse-only question type excludes people. Mitigation: keyboard + tap alternative built into the component, and an alternative "select from list" rendering of the same question.
4. **Scope**: this is a product inside a product. Phases are independent PRs so it can stop after any of them and still be coherent.
5. **Legal/privacy**: certification records are records about a person; retention and Discord naming need explicit rules (see `03`).

## Open questions (please answer before phase 1 starts)

1. Is **one test per tool** right, or can one test cover several tools (e.g. "Wood shop safety" unlocks table saw, jointer, band saw)? The schema supports a `test_tools` join either way; the UI is simpler with one-per-tool. Recommendation: join table in the schema, one-per-tool in the UI for v1.
2. Is a **hands-on check always required** after passing (trainer must sign off), or can some tools be configured "test only, auto-grant"? Recommendation: per-tool `signoff_mode`: `trainer` (default) or `auto`.
3. Can **guests** take tests? Recommendation: no, approved members only.
4. How many sign-offs does a tool need (1, or 2 for dangerous equipment)? Recommendation: per-tool `signoffs_required`, default 1.
5. Do authorizations currently **expire**? (`expires_on` exists.) Recommendation: keep it, and cert validity period becomes an optional per-tool default.
