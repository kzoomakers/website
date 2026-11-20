# Phase 4: revisions force re-pass; recertification

Publishing a **major** revision can require current holders to pass it within the grace period or lose the authorization.

## Publishing flow (extends phase 1's dialog)

1. Author picks **major** or **minor**, writes the change note.
2. If major: the dialog shows **who is affected** (everyone with an active authorization on this tool, split into `training` / `legacy` / `manual` / `override`), the deadline (default today + `grace_days`, editable), and a checkbox "include legacy and manually granted people" (default **on for training-sourced, off for legacy** unless the lead ticks it).
3. A **dry run** link lists the exact members. Publishing needs `training.publish`; starting the rollout needs `training.rollout`.
4. On confirm (one transaction): publish the revision; create `rollouts` + `rollout_members`; set `tool_auths.retake_due_on = deadline` for affected rows; emit `rollout.started`.

Minor revisions publish with no rollout; new attempts use them; existing passes stay valid.

## What "re-pass" means

A member satisfies the rollout when they **pass any attempt on the new revision (or later)**. They do **not** need a new trainer sign-off by default (the trainer already approved the person; the content changed). Per-rollout option "also require hands-on re-sign-off" for substantive changes, which re-opens the cert at `passed`.

Satisfied: clear `retake_due_on`, set `tool_auths.revision_id`, note on the cert timeline, `rollout_members.status='satisfied'`, email "you're current".

## The deadline sweep (job `7351940`, hourly, `withLock`)

For each active rollout past its deadline:
- members still unsatisfied: mark `lapsed`; effective expiry is now in the past (the `LEAST(expires_on, retake_due_on)` fragment from phase 0 already treats them as expired, so nothing else must change); `certifications.state='lapsed'` for the training-sourced; **the `tool_auths` row is kept** (history, and re-pass can restore it) but reads as expired everywhere.
- write `cert_events`, audit, emit `cert.lapsed` (member email, trainer digest, optional Pushover).

Use `current_date` in the shop's time zone, not the DB server's, or lapses fire hours early/late.

## Reminders (job `7351941`, every 6 hours)

Default cadence **14, 7, 3, 1 days before** and on the day (setting). Each reminder is idempotent: `rollout_members.last_reminder_days` prevents duplicates after a restart. Skip anyone already satisfied. Stop reminding after lapse; send one "your authorization has lapsed, here's how to restore it". Respect that these are transactional/safety mail (no unsubscribe), but include a link to contact the trainer.

## Lead controls

- **Rollout page**: progress bar (satisfied / pending / lapsed), per-member status, resend reminder, extend a member's deadline (reason required, `cert_events`), exempt a member (needs `training.override`).
- **Extend everyone**: moves the rollout deadline; allowed any time before it passes and after, restoring lapsed members.
- **Undo rollout**: clears `retake_due_on` for unsatisfied members, restores lapsed ones, marks the rollout `undone_at`. This is the escape hatch for "we marked it major by mistake".
- Safety net: the sweep refuses to lapse more than a configured percentage of holders in one run without a lead confirming (`lapse_guard_pct`, default 50%); it instead alerts via Pushover and email.

## Other recert triggers (same machinery)

- **Periodic expiry**: tool setting "valid N months"; reminders count down to `expires_on`; passing the current revision again renews it.
- **Lapse by inactivity** is out of scope (no usage data).

## Edge cases to test

- Member holds a legacy auth and the rollout excludes legacy: untouched.
- Member is mid-attempt on the old revision when the new one publishes: finishes on the old one, which does **not** satisfy the rollout.
- Two major revisions in a row: second supersedes the first rollout; deadline is the later of the two or a fresh one (setting), stated in the dialog.
- Member passes on the last day, in a different time zone than the server.
- Rollout started when the flag is off; member erased mid-rollout; tool archived mid-rollout.
- Retake of a lapsed member whose auth row has `expires_on` in the past: re-pass restores via `grantFromCert()` and resets both dates.

## Done when

Publishing major revision 2 notifies every holder, sets a visible deadline on their Training page, satisfies them when they pass, lapses stragglers on the deadline, and the lead can undo the whole rollout in one click.
