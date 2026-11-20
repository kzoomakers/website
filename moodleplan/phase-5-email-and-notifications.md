# Phase 5: email and notifications

One event bus (`lib/training/notify.ts` `emit(event, ctx)`), several channels. Failure of any channel never rolls back a state change: events fire **after** commit.

## Events and who hears about them

| Event | Member email | Member in-app | Trainer (email digest / Pushover) | Lead | Discord (phase 6) |
|---|---|---|---|---|---|
| `attempt.passed` | "You passed. Next: a trainer will contact you" | yes | **Pushover** "N ready for sign-off" (batched) | | |
| `attempt.failed` | "Not yet. You can retry on …" (no answers) | yes | | | |
| `attempts.exhausted` | "Talk to a trainer to unlock more" | yes | notice | | |
| `cert.in_training` | "Training started with {trainer}" | yes | | | |
| `cert.rejected` | reason + next steps | yes | | | |
| `cert.certified` | **Congratulations**, authorization details, date | yes | | notice | **announce** (if opted in) |
| `rollout.started` | change note, deadline, link to retake | yes | | summary | |
| `rollout.reminder` | countdown (14/7/3/1/0) | yes | | | |
| `rollout.satisfied` | "You're current" | yes | | | |
| `cert.lapsed` | "Authorization lapsed, here's how to restore it" | yes | digest | summary | |
| `cert.revoked` / `cert.override` | explanation | yes | | **always** | |
| `queue.stale` | | | weekly digest, escalation to lead after N days | yes | |
| `tool.no_trainer` | | | | yes | |

## Email implementation

- Send through `enqueueMail` (existing retries and backoff), rendered with `lib/mail-render.ts` so training mail matches the site's templates. Add a `training` mail layout/template set.
- **Editable copy**: subject and body for each event live in `training_settings` with defaults in code, editable on the Settings page with variables (`{{name}}`, `{{tool}}`, `{{deadline}}`, `{{score}}`, `{{trainer}}`, `{{link}}`), live preview, and "send me a test". Variables are escaped; templates cannot execute anything.
- Plain-text part always included. Links are signed or require login (no answers or scores in the body of a failed attempt beyond pass/fail).
- **From/reply-to**: reply-to is the assigned trainer or the training mailbox (setting); the site `From` stays.
- **Recipient resolution**: member's account email; trainer list from `tool_trainers`; lead list from the `training.override` list or full admins if empty.
- **Transactional, not marketing**: skip subscription preferences but never put these people on mailing lists; keep `mail_queue` rows free of the member's score.
- **Dedup**: `(event, cert_id/rollout_member, day)` key so retries and restarts don't double-send.
- Per-event on/off switches on Settings; sensible defaults all on.

## In-app

`notifyUser` (existing) with a link to `/members/training`. The member Training page shows an unread count via the existing notifications UI.

## Staff alerts (Pushover)

Add channel `training` to `CHANNELS` in `lib/pushover.ts` ("Training: people ready for sign-off, lapses"); Pushover Delivery Groups are managed externally per the file's own comment, so this only needs a new group key on the Alert delivery page. **Batch**: a flurry of passes becomes one "5 ready for sign-off" message every 15 minutes, not 5 pushes.

## Trainer digest

Weekly (Monday morning, same pattern as `runDigest` in `ga-notify.ts`): what's waiting and for how long, per trainer, only for their tools. Skipped when empty. Opt-out per trainer in their account.

## Settings page additions

Event toggles, copy editor, reminder cadence, digest on/off, reply-to, stale thresholds, "preview and test send".

## Tests

- Each event produces exactly one queued mail with the right recipients (no member gets another member's mail; trainers only for their tools).
- Dedup after simulated restart.
- Variable escaping (a member named `<script>` is safe in HTML and in subject).
- Channel failure (mail queue down, Pushover not configured) leaves state intact and logs.
- Opt-out and toggles respected; overrides always notify the lead.

## Done when

Walking a test member through pass, training, sign-off and a rollout produces the right email at each step, the trainer gets one batched push, and editing a template changes the next email.
