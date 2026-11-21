# Phase 7: manual advance (override), reporting, analytics

## Manual advance / override (`training.override`)

"You can manually advance people past a process if the need arises." Make it possible, deliberate, and visible.

| Action | Effect | Required |
|---|---|---|
| **Waive the test** | Cert created as `passed` with `source='override'`, no attempt, then proceeds to training/sign-off normally | reason |
| **Skip training, go to sign-off** | `passed` to `ready` | reason |
| **Certify now** (skip everything) | Straight to `certified`, `tool_auths.source='override'` | reason (min length) + confirm, optionally a second approver (setting) |
| **Credit prior certification** | Records "certified elsewhere/previously" with a date and evidence note; common for new members who hold a certification from another space | reason, optional attachment |
| **Extend or exempt in a rollout** | See phase 4 | reason |
| **Unlock attempts / reset cooldown / void an attempt** | Ops fixes for broken or disputed attempts | reason |
| **Revoke** | `certified` to `revoked`, `tool_auths` row removed or expired, member emailed | reason, optional follow-up for safety incidents |
| **Reinstate** | undo a revoke or lapse | reason |

Rules:
- Every override requires a **reason**, writes a `cert_events` row of kind `override`, an audit entry, and emails the lead list. It is shown with an "Override" badge on the member file, the queue, reports and the member's own Training page ("Certified by exception").
- A person cannot override their own certification, ever, including full admins.
- Settings: `override_needs_second_approver` (default off).
- UI keeps overrides **out of the normal buttons**: a distinct "Override…" menu with a warning dialog, so nobody does it by habit.

## Reports (`training:reports`)

All filterable by date range, tool, trainer; CSV export for each.

1. **Pipeline**: counts by state, median/90th-percentile time from pass to sign-off, aged items.
2. **Tool coverage**: per tool, how many certified, by source (training / legacy / manual / override), expiring in 30/60/90 days, no trainer assigned, no test.
3. **Member transcript**: everything for one person (tests, attempts, notes, sign-offs, authorizations); printable; this is also what's exported on a data request.
4. **Trainer activity**: sign-offs, average wait, sessions logged (useful for recognising volunteers and spotting overload).
5. **Rollout status**: per rollout, satisfied/pending/lapsed.
6. **Overrides report**: every override with reason, for the board's review. A monthly summary can be emailed to the board list (the site already sends a monthly PII report; reuse that job pattern).
7. **Audit view**: link into the existing audit log filtered by `training.%`.
8. **Attempt evidence (disputes)**: one attempt exactly as stored: revision number and `content_hash`, the questions and keys as they were on that revision, the answers as submitted, `per_question` and totals, `started_at` / `due_at` / `submitted_at`, `ip`, `user_agent`, and any void. JSON plus a printable page. Needs `training:reports` read; every export writes an audit row (`training.attempt.evidence`). Limit: only the final saved answers are stored, not autosave history, so "what they typed when" can't be answered from this.

## Question analytics (the thing that finds bad questions)

Per question (followed across revisions by `qkey`): attempts, percent correct, discrimination (do high scorers get it right?), most common wrong answer, average time. Flags: "nearly everyone misses this" (maybe the key is wrong), "nearly everyone gets it right" (maybe useless), "high scorers miss it". Each flag links to the question editor and the regrade workflow from `03`.

## Regrade tool

Choose a published revision, correct the key in a new revision, preview "N attempts change outcome (X fail to pass, Y pass to fail)", apply only the fail-to-pass direction automatically (opening certs); pass-to-fail results go to a lead for a human decision, never silent demotion.

## Roles on the Access page

Preset buttons for the role bundles in `02` (Trainer, Test author, Training lead, Auditor) that write ordinary `user_perms` rows and, for Trainer, open the tool picker for `tool_trainers`.

## Tests

Override matrix (each action: needs permission, needs reason, notifies lead, badge shown, cannot target self). Report numbers against a fixture dataset. Regrade preview matches applied result. CSV is escaped (formula injection: prefix `=`, `+`, `-`, `@`). Evidence export matches the stored attempt row.

## Done when

A lead can credit a transfer member's old certification, waive a test, and certify someone by exception, each with a reason, and all three show up in the overrides report and the board summary; question analytics highlights a deliberately wrong key in seeded data.
