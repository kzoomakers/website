# Phase 0: foundations

No member-visible feature. This phase makes every later phase small. Mergeable on its own.

## Do first

1. **Read the Next.js docs the repo points at.** `web/AGENTS.md`: "This is NOT the Next.js you know." Read the relevant guides under `web/node_modules/next/dist/docs/` for route handlers, server actions and caching before writing any route.
2. Add `moodle/` (and note `phapps/`, `lobsters/`) to `.gitignore` or move them; they are untracked and unrelated to the site build.

## Refactors

| Refactor | Why | Care |
|---|---|---|
| Move tools + authorizations code out of `lib/crm.ts` (`listTools`, `saveTool`, `deleteTool`, `authsFor`, `grantAuth`, `revokeAuth`) into `lib/tools.ts`; re-export from `crm.ts` so no caller breaks | Training must own these concepts; `crm.ts` is a dumping ground | grep every import first (`app/admin/people/*`, `app/members/*`, `app/api/*`); keep signatures byte-identical; move tests with them |
| One SQL fragment/view `tool_auths_effective` (`expired`, `effective_expiry`) used by `authsFor` and every other reader | Retake deadlines must count as expiry in every place at once | List every reader of `tool_auths` (only `lib/crm.ts` today, confirm by grep) |
| `deleteTool` refuses when the tool has tests or certifications; add `archived` flag on `tools` | Don't destroy certification history | UI text on Tools page explains |
| `canSpecial()` accepts the new perms (union type) and the Special permissions page lists them | Phase 3+ needs them | Keep empty-list-means-full-admin rule |
| `db.ts` stays a thin orchestrator: it calls `training/schema.ts` instead of growing | File is already large | Same idempotent `CREATE TABLE IF NOT EXISTS` style, wrapped like the rest |
| Notification fan-out helper `lib/training/notify.ts` skeleton: `emit(event, ctx)` | Phases 3 to 6 all hang off it | Empty handlers now, filled per phase |

## Schema

Everything in `01-architecture-and-data-model.md`, created empty. `ALTER TABLE tool_auths` columns added with defaults so the existing rows become `source='legacy'`. Add indexes: `attempts(user_id, revision_id)`, `certifications(state, tool_id)`, `cert_events(cert_id, at)`, `tool_trainers(user_id)`.

## RBAC and nav

- `SECTIONS`/`SECTION_LABEL`/`GROUPS` updated; manifest entries added under People with `section: "training"` and `hidden: false` (see `02`).
- Page placeholders ("Coming soon" behind the flag) so permission pages appear on the Access screen immediately and admins can start assigning.
- Role presets on the Access page (optional, can slip to phase 7).
- `training_enabled` setting (default off). Members' Training menu item and all endpoints 404 while off.
- Add `Training` to `MEMBER_MENU` behind the same flag.
- Add `training` audit area.

## Background jobs

Reserve lock ids and register no-op jobs in `instrumentation.ts`: `7351940` lapse/deadline sweep (hourly), `7351941` reminders (6-hourly), `7351942` Discord outbox (every minute). Real bodies arrive in phases 4 to 6.

## Tests (node:test, `.mjs`, `npm test`)

- `access.test.mjs` updated: new section/pages/groups are consistent with the manifest.
- A DB-backed test for the schema (pattern: `tests/feed-*-db.test.mjs`): migration is idempotent; running it twice is a no-op; legacy rows get `source='legacy'`.
- Test that `tool_auths_effective` treats `LEAST(expires_on, retake_due_on)` correctly, including NULLs.

## Done when

- `npm test` green, `next build` green, Access page shows the Training section, flag off means no visible change for members, existing Tools & sign-offs page behaves exactly as before.
