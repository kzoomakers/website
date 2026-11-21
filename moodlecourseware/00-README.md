# Courseware: plan

Goal: members can **learn** on the site, not only get tested. An admin writes a course (lessons, YouTube videos, attachments, practice quizzes). A member works through it, practises, then takes the real test, then a trainer signs them off. Separately, a **Document Library** holds shop manuals, safety guides and SOPs with tags, tiers and share links. Courses and tools link to library documents.

This is a re-implementation of ideas from Moodle (course > section > activity, completion tracking, practice quiz mode), not a port of its code (GPL; same position as `moodleplan/03-gaps-and-considerations.md`). The `moodle/` folder is for reference only.

## What already exists (we build on it, we don't redo it)

| Have | Where | Courseware uses it for |
|---|---|---|
| Tests, immutable revisions, 10 question types, server-side grading | `web/lib/training/{tests,questions,attempts}.ts` | Practice quizzes reuse the question bank and grader |
| Tools, `tool_auths`, certifications, sign-off queue, trainers | `web/lib/training/certs.ts`, `/admin/people/training/*` | Course → test → sign-off is the learning path for a tool |
| Training author UI (question editor, preview, diff) | `web/app/admin/people/training/tests/[id]/*` | Quiz editor embedded inside the lesson editor |
| S3 storage, media table, image worker | `web/lib/s3.ts`, `web/lib/media.ts`, `web/workers/image-worker.mjs` | Library file storage, thumbnails |
| PDF viewing and sealing | `@embedpdf/viewer-react`, `pdfjs-dist`, `pdf-lib`, `lib/pdf-seal.ts` | Library viewer, first-page thumbnails |
| Nav manifest, permission sections, alert badges | `web/lib/nav-manifest.ts`, `web/lib/access.ts` | New sections `learning` and `library` |
| Sanitized rich text | `web/lib/sanitize.ts` | Lesson body |

## Files

| File | Holds |
|---|---|
| `01-moodle-feature-map.md` | Every Moodle feature considered: port, adapt, or skip |
| `02-courses-and-lessons.md` | Course structure, lesson blocks, YouTube embeds, progress, completion |
| `03-practice-quizzes.md` | Practice mode on the existing quiz engine |
| `04-document-library.md` | Separate PDF library: tags, categories, tiers, share links, drag-to-reorder |
| `05-hooks-and-integration.md` | How courses, library, tests, tools and sign-off connect |
| `06-navigation-restack.md` | Admin and members menu changes |
| `07-ux-spec.md` | The experience bar, screen by screen |
| `08-data-model.md` | Tables |
| `09-project-plan.md` | Phases, sizes, order, risks, open questions |
| `10-future-phases.md` | Further Moodle gaps found by reading its source, ranked, with phases P9–P16 and six items promoted into v1 |

## Decisions I'm making unless you object

1. **Courses are optional.** A tool test works with or without a course. A course may be required before the test (per tool toggle, off by default) so nothing existing breaks.
2. **Practice never counts.** Practice attempts live in their own table, never touch `attempts`, `certifications` or `tool_auths`, and can show answers immediately.
3. **The library is its own thing.** Courses *reference* documents by id; they don't own them. One document can serve many courses and tools.
4. **Sharing is by unguessable token**, revocable, optionally expiring, and view-only or download. Visibility tiers decide who can see a document *without* a token.
5. **YouTube via `youtube-nocookie.com` with a click-to-load poster**, so no Google cookies load until a member presses play (the site already has a cookie/analytics consent story).
6. **Versioned documents.** Uploading a new file to a SOP makes a new version; old links keep working and always serve the current version.
7. **No new heavy dependencies.** Drag and drop uses native pointer/keyboard handling or whatever the Puck/menu editor already uses.

## Answered questions (2026-11-20)

1. **SOP/safety acknowledgements: yes.** Members record "I have read version N" (who, which version, when); staff see who hasn't read the current version; a tool's test can optionally require it (`require_ack`). In scope for P2.
2. **Public documents: yes**, as an explicit `public` tier per document, optionally listed on a public `/library` page. Non-public documents are never indexed.
3. **Course authoring: admins + tool trainers.** A new `learning` permission section, plus trainers can edit courses linked to tools they train (same idea as `tool_trainers`).

No open questions remain; P0 and P1 can start.

## Status

| Phase | State |
|---|---|
| P0 foundations | Done: `learning` and `library` permission sections, "Learn" top-bar group, `learnFlags()` switches (settings key `learning`, both off), library tables and indexes. The course tables and `tool_training.require_course/require_ack` are deferred to P3 (draft in `p3-schema-draft/`), so nothing unused is created before it is needed. CSP already allowed `youtube-nocookie.com`. |
| P1 library core | First slice done: multi-PDF upload (magic bytes, upload limit, S3, page count + text by a sandboxed worker), drafts titled from the filename, tier-filtered list and full-text search, tags, pin, soft delete, admin page `/admin/library`, member browse and document page `/members/library`. |
| P1 folders | Done: up to 3 levels, a document can sit in several folders, "Folder" picker per document (the non-drag "Move to…"), recycle-bin view with Restore, member folder browsing (empty folders hidden from non-staff). |
| P1 polish | Done: bulk edit toolbar (tier, status, folder, add tags), tag rename and merge, page-1 thumbnails (worker, optional `@napi-rs/canvas`), 30-day recycle-bin purge in the retention job. |
| P1 still to do | Drag-reorder (the Folder picker is the non-drag path), remembered last page per member (the document page now uses the `@embedpdf` viewer, shared with the waiver page), DB tests (need a scratch Postgres). |
| P2 so far | Done: share links (hashed token, 30/7/1 days, passcode always required, revoke, open counts, `/d/<token>`, own `shares` permission), acknowledgements ("I've read version N", who-has-read report), SOP owner and review date with an overdue filter. |
| P2 versioning | Done: upload a new version with a change note and a re-read flag (an unflagged update keeps earlier acknowledgements), version history with staff-only access to old files. |
| P2 QR | Done: printable QR sheet per document at `/admin/library/qr/<slug>` (opens the member page; tier rules still apply). |
| P2 still to do | review reminders, all-shares list page, triage mode. |
