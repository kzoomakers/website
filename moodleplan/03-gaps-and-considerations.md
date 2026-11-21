# Gaps and considerations (things not in the original ask)

Grouped by how much they matter. **Must** items are folded into the phases; **Should** items are in the phases but cuttable; **Later** items are parked.

## Must

### Licensing
`moodle/` in the repo root is a Moodle checkout (GPL v3). **Do not copy Moodle code, templates or JS into the site.** Re-implement behaviour from the concepts. Also: it is untracked, hundreds of MB, and shows in `git status`; add `moodle/` to `.gitignore` (or move it outside the repo) before someone commits it by accident.

### Cheating and answer leakage
Tests gate equipment that can hurt people. The key never leaves the server, order is randomized per attempt with a stored seed, attempts are rate-limited and have a cooldown, and retaking after a fail shows a **different** random subset when the bank is larger than the test (question pools: "draw 10 of 25"). Honest limit: it is an open-web test; the hands-on sign-off is the real control, which is why sign-off exists.

### Critical questions
A "required correct" flag: you can score 90% and still fail if you missed "Is the blade guard required?". Standard in safety training; cheap to build into grading.

### Major vs minor revisions
Without this, fixing a typo forces everyone to retake. Publishing asks which it is, shows **how many people it affects** and the deadline, and requires a change note that is emailed to affected members.

### Grandfathering existing authorizations
All current `tool_auths` become `source='legacy'`. Launch does not lapse anyone. A later major revision can be rolled out to "everyone with this tool, including legacy", chosen explicitly with the count shown.

### Attempt integrity
Server-side timer, autosave, one open attempt, resume after a closed tab, and a clear "your time ran out" outcome. Record IP and user agent for disputes (retention rules below). The dispute export is in phase 7.

### Fixing a wrong answer key
Inevitable. Needs **regrade**: edit the key in a *new revision*, then "re-grade attempts on revision N with the corrected key", which can promote a fail to a pass (and open a cert) or leave a pass alone. Never silently demote a certified person; a demotion needs a human decision.

### Accessibility
- Every drag-and-drop question has a keyboard path and a tap path (select a label, then select a zone) and the same question can render as a list of dropdowns. No question type may be mouse-only.
- Images need alt text; diagram labels need text equivalents.
- Per-member **accommodations**: extra time multiplier, read-aloud allowed, recorded on the attempt. Set by a trainer, not self-served.
- Meets the same contrast/focus standards as the rest of `/members`.

### Privacy and retention
- Attempts and certifications are personal records. Add them to the PII/retention story: `lib/retention.ts` (5-year limit), `lib/pii*.ts` export/erase for a member (the site already has `exportPerson`/`erasePerson` for mail; training needs the same two functions).
- On member erase: certifications keep a **de-identified** record if safety/insurance retention requires it; decide with the board. Default: erase attempt answers, keep "tool X certified on date" until the authorization itself would be deleted.
- Discord: opt-in, see phase 6. Webhook URL stored with `sealText`.
- Trainer notes may contain sensitive remarks about a person; they are visible to trainers/leads and the member **only if** flagged "share with member". Default: private to staff. Say so in the UI.

### Concurrency and double-clicks
Two trainers signing off the same cert, a member double-submitting, a rollout started twice. Every transition is a conditional `UPDATE ... WHERE state = $expected RETURNING`, and the second caller gets a clear "already done by X at Y". Unique partial index prevents two open certs per member and tool.

## Should

| Item | Notes |
|---|---|
| **Prerequisites** | Tool B requires certification on tool A (e.g. wood shop safety before the table saw). `tool_prereqs` (see 01); a prerequisite is met by an effective authorization on the required tool when the attempt starts. Member page greys out locked tests with the reason. |
| **Hands-on checklist per tool** | A short checklist the trainer ticks during sign-off ("demonstrated lockout", "supervised 3 cuts"). Stored on the cert. Turns free-text notes into something reportable. |
| **In-person / paper test entry** | Trainer enters a score for a paper test, same pipeline, `source='test'` with `attempt_id` null and a flag. |
| **Study material** | Test intro can link to the handbook/how-to page or upload a PDF/video link; "read this first" gate optional. |
| **Retake policy** | Max attempts, cooldown hours, and after N failures a trainer must unlock further attempts (sends the member to talk to a human). |
| **Certification expiry** | Per-tool optional validity (e.g. laser: 2 years). Reuses `expires_on` + the same reminder pipeline as recert. |
| **Trainer workload** | Queue ages: "waiting 9 days" highlighted, weekly digest of stale items to trainers, and escalation to the lead after N days. |
| **Member can message the trainer** | Reuse the Messages/inbox thread (`/members/inbox`) rather than building chat. |
| **Printable certificate / wallet proof** | PDF with the existing `pdf-seal` signing, optional. |
| **Question bank sharing** | Copy a question from another test into a draft. |
| **Import** | CSV/JSON import of questions; export for backup and review by the board. |
| **Preview as member** | Authors take the draft without creating real attempts or certs (attempt marked `preview`, excluded from stats). |
| **Time zone** | Deadlines are dates in the shop's zone (America/Detroit); store `date`, compare in that zone, same as the hours/tours code. |

## Later (parked, but the schema doesn't block them)

- Manually graded essay questions; peer review.
- Video-based questions.
- Certification badges on the member directory and profile (the directory already lists skills; a "Certified on" badge is a small follow-up).
- Door/equipment-lockout integration reading `tool_auths_effective` (the one-fragment refactor in phase 0 makes this cheap).
- Waitlist/scheduling for hands-on sessions (could reuse the Classes feature: a class that grants sign-off).
- Slack/other webhooks (the outbox is generic on `kind`).

## Failure modes to design around

| Scenario | Handling |
|---|---|
| Member passes, trainer leaves the club | Reassign: admin can reassign tools; orphan certs surface in the lead's queue. |
| Webhook URL leaked or revoked | Settings page shows last status; failures never block certification; outbox retries with backoff then parks as `failed`. |
| Email down | `mail_queue` already retries; the cert is unaffected. |
| Lapse job misfires | Rollouts are per-revision and undoable; lapse writes `cert_events`; "undo rollout" restores `retake_due_on` to NULL and re-grants. |
| A tool is deleted | `tool_auths` cascades today; certifications must **not** silently vanish. Block deletion of a tool that has tests or certs; offer archive instead (change `deleteTool`). |
| Member changes name/email | Everything is keyed by `user_id`; names are looked up at render time. Discord posts store the text at post time, which is fine. |
| Two revisions published back to back | A rollout is tied to a revision; publishing a second major revision supersedes the first rollout's deadline and says so. |
| A member is mid-attempt when a new revision is published | Their attempt finishes on the revision they started; new attempts use the current revision. |
| Member disabled (`site_users.disabled_at`) mid-attempt | Timer keeps running server-side. The attempt expires at `due_at` and is graded from the last autosave, as in phase 2. The lead can void it. |
| Member disabled while a rollout is pending | Deadline keeps running; a pause would need an end date. Lead extends that member's deadline when they return (phase 4). |
| Member returns after a lapse | Nothing reopens automatically. The certification stays `lapsed`, the authorization reads as expired, and they take the test again (new attempt, new certification). Old attempts and notes stay. |
| Member returns after a revoke | A revoke is final for that certification. Reinstating is the override action in phase 7, with a reason. |
