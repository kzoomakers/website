# RBAC and roles

## Constraint

`lib/access.ts` has a fixed `SECTIONS` list and a `section` / `section:page` grant model, with `system:write` as a full admin. Page grants only ever **add** access. Menus come from `lib/nav-manifest.ts`. Follow that model; don't invent a second one.

## New section: `training`

```ts
SECTIONS += "training"            // SECTION_LABEL: "Training"
GROUPS: Members group sections: ["people", "tours", "makerfavor", "training"]
```

Pages (manifest entries under the People tab, `section: "training"`, same trick as `membership-classes`):

| Key | URL | Purpose | Read | Write |
|---|---|---|---|---|
| `queue` | `/admin/people/training` | Who is ready for sign-off; open a person's file | see queue and files | take notes, mark ready, sign off, reject |
| `tests` | `/admin/people/training/tests` | Test library and builder | view tests and drafts | create/edit **drafts**, request publish |
| `trainers` | `/admin/people/training/trainers` | Assign trainers to tools | view | assign/remove |
| `reports` | `/admin/people/training/reports` | Pass rates, question analytics, exports | view | export |
| `settings` | `/admin/people/training/settings` | Grace period, reminders, email copy, Discord | view (secrets masked) | change |

`full: true` is **not** used for these (that flag means "only a full admin may ever open"), because the whole point is delegating them.

## Special permissions (the existing `special_perms` mechanism)

These are actions too consequential to hang on write-level alone. Extend `canSpecial()`'s union type and the Special permissions page.

| Perm | Allows | Default when list is empty |
|---|---|---|
| `training.publish` | Publish a revision, and choose major vs minor | full admins only |
| `training.override` | Manually advance/waive a member past a step, revoke a certification | full admins only |
| `training.discord` | Change the webhook, send a test post | full admins only |
| `training.rollout` | Start/undo a forced re-pass with a deadline (can lapse many people) | full admins only |

Same default rule as `canSpecial` today: empty list means any full administrator.

## Per-tool trainers (data, not a permission key)

A section/page grant says *what kind of screen* someone can use. **Which tools** they can sign off is data: `tool_trainers(tool_id, user_id)`.

| Caller | Sees in the queue |
|---|---|
| Whole-section `training` write, or `system` write | every tool |
| Page grant `training:queue` **and** assigned in `tool_trainers` | only their tools |
| Page grant `training:queue` and assigned to nothing | empty queue, with a message telling them who to ask |

Every sign-off endpoint checks **both**: `levelOf(me, "training", "queue") === "write"` **and** (whole-section/system write **or** a `tool_trainers` row). This is the check most likely to be forgotten, so it lives in one function, `canSignOff(me, toolId)`, covered by tests.

## Roles (named bundles, for the Access page)

These are not new code paths, just presets the Access screen can apply so admins don't hand-tick checkboxes. Stored as ordinary `user_perms` rows.

| Role | Grants |
|---|---|
| **Trainee** | none (any approved member; guests excluded) |
| **Test author** | `training:tests` write |
| **Trainer** | `training:queue` write + assigned tools |
| **Training lead** | whole `training` write; plus `training.publish` if chosen |
| **Training admin** | `training` write + all four special perms |
| **Training auditor** | `training` read |

## Separation of duties

1. **Nobody signs off themselves.** Enforced in code: `cert.user_id !== actor member id`, with no admin bypass. (An override on yourself is also refused.)
2. **Author is not the sole publisher.** If `training.publish` has anyone on it, publishing requires someone on the list; an author who is also on the list may publish. A setting `require_second_publisher` (default off) forces publisher ≠ last editor.
3. **Override leaves a loud trail**: separate state (`waived` / `source='override'`), mandatory reason (min length), shown on the member's file and in reports, always emails the training lead list.
4. **Trainer cannot edit the test the person passed**: they only see the revision as it was.
5. Multi-sign-off tools: the same trainer cannot count twice (`UNIQUE (cert_id, trainer_id)`).

## Member-side access

- Taking a test needs: signed in, approved member (reuse the approval gate in `lib/approvals.ts`, see `tests/approval-gate.test.mjs`), waiver current if the site requires it for members, not suspended.
- A member sees their own attempts and certifications only. Their review view obeys the revision's `review_mode`.

## Audit

Add to `lib/audit-areas.ts` a `training` area matching `training.%`. Actions: `training.test.draft`, `.publish`, `.retire`, `.attempt.void`, `.cert.open`, `.cert.ready`, `.cert.signoff`, `.cert.reject`, `.cert.override`, `.cert.revoke`, `.rollout.start`, `.rollout.undo`, `.discord.config`, `.perm.change`. The existing `user.authorize` action keeps being written by `grantAuth` so old audit queries still work.

## Tests that must exist for RBAC (phase 0 skeleton, filled as pages land)

Pattern after `tests/access.test.mjs` and `tests/authz.test.mjs`:
- every training endpoint rejects a signed-out caller, a plain member, a read-only grantee (for writes), and a trainer for a tool they aren't assigned;
- self sign-off refused for admin, trainer, and root;
- a page grant on `training:tests` does not open `training:queue`;
- the `Page` list and the nav manifest agree (existing test) after the new entries.
