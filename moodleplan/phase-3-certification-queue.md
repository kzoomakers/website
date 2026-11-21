# Phase 3: certification queue and sign-off

Admin > People > **Training**. A trainer sees who is ready, reviews the test, records what they did with the person, signs off, and the member receives the authorization.

## Queue screen (`training:queue`)

- Tabs: **Ready for review** (state `passed`), **In training** (`in_training`/`ready`), **Needs attention** (stale, rejected-retry, orphaned tool without trainer), **Recently certified**.
- Columns: member, tool, score, attempt date, **waiting days** (amber after 3, red after 7), assigned trainer, sign-offs `1/2`.
- Filters: tool, shop/category, trainer, state, search by member. Scope is limited to the trainer's tools (`canSignOff`, see `02`).
- Counter on the People tab via the existing alert-badge mechanism (`AlertKey` in `nav-manifest.ts`, add `"training"`).
- Bulk: none for sign-off (each needs a note); bulk assign trainer is fine.

## Member file (one screen per certification)

1. **Header**: member (link to their People page), tool, state, revision used, passed on.
2. **Test result**: score, time taken, attempt count, critical questions, per-question outcome. A trainer can open **their answers** (the stored `answers` + `per_question`), side by side with the correct key (trainers see the key; members may not). Weak areas highlighted ("missed 3 of 4 lockout questions") so the hands-on session can target them.
3. **Hands-on checklist** (items from `tool_checklist_items`, see 01): each tick is a `cert_checklist_ticks` row. Advisory in v1: sign-off is allowed with items unticked, and the sign-off dialog shows how many.
4. **Notes timeline**: add dated notes ("did 3 supervised cuts, needs work on feed rate"), each stored as a `cert_events` row with the author and a "share with member" toggle. Notes are append-only; corrections are new notes.
5. **Additional training**: record sessions (date, duration, what was covered, who). A simple structured event type `training_session` is enough.
6. **Actions**:
   - *Start training* (`passed` to `in_training`, assigns the trainer to themselves),
   - *Mark ready* (`in_training` to `ready`),
   - *Sign off* (confirm dialog showing exactly what will be granted, date, optional expiry, required note),
   - *Reject / needs more* (reason required; member is told what to do next; they can retake the test or continue training),
   - *Unlock more attempts*, *Set accommodation*, *Reassign trainer*.
7. **Override** actions are in phase 7 and sit behind `training.override`.

## Sign-off transaction (`certs.signOff`)

```
BEGIN
  SELECT cert FOR UPDATE; require state IN ('in_training','ready','passed') and actor != cert.user_id
  INSERT cert_signoffs (cert_id, trainer_id)   -- unique: same trainer can't count twice
  IF count(signoffs) >= signoffs_required:
       UPDATE certifications SET state='certified', certified_at=now(), certified_by=actor, valid_until=(today + tool_training.validity_months, or NULL)
       grantFromCert()  -> upsert tool_auths (source='training', cert_id, revision_id, granted_by, expires_on, note, retake_due_on=NULL)
       logAudit(actor, "training.cert.signoff", "member: tool, rev N")
       also logAudit("user.authorize") so existing audit views still list it
  INSERT cert_events
COMMIT
THEN emit(cert.certified)   -- email, in-app, pushover, discord (phases 5, 6) run after commit and can fail without undoing the grant
```

If a member already has a `tool_auths` row (legacy or earlier cert), the upsert refreshes it (`ON CONFLICT DO UPDATE`, same as `grantAuth`) and clears `retake_due_on`.

## Trainer assignment screen (`training:trainers`)

Matrix of tools x trainers (add/remove), "no trainer assigned" warning list, and per-tool settings: `signoff_mode`, `signoffs_required`, `validity_months`, `manual_grant_allowed`, checklist items, prerequisites. These live in `tool_training`, `tool_checklist_items` and `tool_prereqs` (see 01), not the `tools` table, so the existing Tools page stays simple.

## Tools & sign-offs page changes

- Show per tool: test status, trainers, certified count, "awaiting" count.
- Granting an authorization **manually** (the existing button) stays, but writes `source='manual'` and is noted in reports as "granted without training". Per-tool setting can disable manual grants for tools that require a test (`manual_grant_allowed`), leaving override as the only route.

## Tests

- State machine table test: every legal and illegal transition.
- `canSignOff` matrix (assigned / unassigned / whole-section / read-only / self).
- Multi-sign-off: 2 required, same trainer twice refused, second trainer completes.
- Race: two trainers sign off simultaneously, exactly one grant, no duplicate rows, second sees "already certified".
- Grant writes the right `tool_auths` columns and the member profile shows it via `authsFor`.
- Audit rows exist for each action.

## Done when

A member passes, appears in the queue for the assigned trainer only, the trainer adds notes and a session, signs off, and the member's profile shows the new authorization with date and certifier. Unassigned trainers cannot see or touch it.
