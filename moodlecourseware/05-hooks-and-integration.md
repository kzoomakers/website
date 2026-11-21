# Hooks: how it all connects

```
            ┌────────────── Library document ──────────────┐
            │  (manual, SOP, safety guide, tagged, tiered)  │
            └───────┬───────────────────┬───────────────────┘
        referenced by              attached to
            │                          │
         Lesson block ◄── Course ──► Tool ◄── Test ──► Cert queue ──► tool_auths
                          │                   ▲
                    Practice quiz ────────────┘ (same question bank, never counts)
```

## The tool is the hub

A **tool page for members** (`/members/training`, renamed "Tool authorizations" today) becomes one track per tool:

`Read` (library docs) → `Learn` (course) → `Practise` (practice quiz) → `Test` (existing) → `Sign-off` (existing, with trainer) → `Authorized ✔`

Each step shows done / current / locked. Today's page already knows the last three steps; the first three are new.

## Hooks, concretely

| Hook | Mechanism |
|---|---|
| Tool → documents | `tool_docs(tool_id, doc_id, role)`; role = `manual` / `sop` / `safety` |
| Tool → course | `course_tools` |
| Tool → required before test | `tool_training.require_course boolean` (new column, default false); the existing "start test" check adds one condition |
| SOP acknowledgement before test | `tool_training.require_ack boolean`, default false |
| Lesson → document | Library doc block, by id |
| Course complete → eligibility | A pure function `courseDone(user, course)` used by the "can start test" check and the member track |
| Certification granted → show in profile | Already exists; add "Courses completed" beside it |
| New SOP version → who's affected | Query: members with an effective auth on linked tools who haven't acknowledged the current version |
| Admin tool editor (`/admin/people/tools`) | Gains a "Learning" panel: pick documents, pick course, set the two toggles |
| Public site | Public-tier documents with "listed" appear on a public `/library` page (guided-page style) and the safety posters; pages can embed a document card |
| Machine QR codes | Point at `/library/tool/<toolslug>`, a landing page with docs, course, and the member's own authorization state |
| Notifications | Reuse `lib/training/notify.ts` for acknowledgement requests and "course updated" notices |
| Audit | Same audit log areas (`lib/audit-areas.ts`): `library`, `courses`, plus share-link create/revoke |

## Permission model

New sections in `lib/access.ts`:

- **`learning`** (courses, quizzes, learning reports). Special permission **Edit any course**; trainers get edit rights to courses linked to their own tools (same idea as `tool_trainers`).
- **`library`** (documents, folders, tags, links). Special permissions **Publish documents**, **Create share links**, **Delete documents**. Separate because a share link can expose data outside the club.

Members never need a permission to read what their tier allows.

## Things that must not break

- Tests and certifications behave exactly as today when `require_course` and `require_ack` are off.
- Training can still be fully switched off with the existing `features().tests` flag; add `features().courses` and `features().library` flags so each can ship dark.
