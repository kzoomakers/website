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
| P0 foundations | Done: `learning` and `library` permission sections, "Learn" top-bar group, `learnFlags()` switches (settings key `learning`, both off), library tables and indexes. The course tables and `tool_training.require_course/require_ack` are created by `web/lib/courses/schema.ts` (P3). CSP already allowed `youtube-nocookie.com`. |
| P1 library core | First slice done: multi-PDF upload (magic bytes, upload limit, S3, page count + text by a sandboxed worker), drafts titled from the filename, tier-filtered list and full-text search, tags, pin, soft delete, admin page `/admin/library`, member browse and document page `/members/library`. |
| P1 folders | Done: up to 3 levels, a document can sit in several folders, "Folder" picker per document (the non-drag "Move to…"), recycle-bin view with Restore, member folder browsing (empty folders hidden from non-staff). |
| P1 polish | Done: bulk edit toolbar (tier, status, folder, add tags), tag rename and merge, page-1 thumbnails (worker, optional `@napi-rs/canvas`), 30-day recycle-bin purge in the retention job. |
| P1 still to do | Drag-reorder (the Folder picker is the non-drag path), remembered last page per member (the document page now uses the `@embedpdf` viewer, shared with the waiver page), DB tests (need a scratch Postgres). |
| P2 so far | Done: share links (hashed token, 30/7/1 days, passcode always required, revoke, open counts, `/d/<token>`, own `shares` permission), acknowledgements ("I've read version N", who-has-read report), SOP owner and review date with an overdue filter. |
| P2 versioning | Done: upload a new version with a change note and a re-read flag (an unflagged update keeps earlier acknowledgements), version history with staff-only access to old files. |
| P2 QR | Done: printable QR sheet per document at `/admin/library/qr/<slug>` (opens the member page; tier rules still apply). |
| P2 reminders + shares | Done: all-shares page `/admin/library/shares` (with revoke), and an "overdue review" count badge on Library > Documents for staff (SOPs past their review date). |
| P2 triage | Done: `/admin/library/triage` shows drafts one at a time (PDF left, fields right); Enter publishes and moves on. P2 is complete except emailing owners (owners are free text, not users). |
| P3 first slice | Done: course tables live; `/admin/learning` (course list, create, recycle bin, on/off switch) and `/admin/learning/<id>` editor: sections and lessons (add, rename, delete, move up/down), blocks (text, YouTube video with chapters and transcript, library document, callout, checklist, divider) with move/delete, completion rule, "matters for safety" flag, autosave, lesson revisions, validation warnings. Blocks are cleaned server-side (`lib/courses/blocks.ts`, tested). |
| P3 still to do | Image block (media picker), preview as member (arrives with the P4 player), drag reorder, trainer editing of their tools' courses, duplicate/export/import JSON, learning data in privacy export (A4), read-only mode in the editor for read-level users. |
| P4 player | Done: `/members/courses` (list with progress), `/members/courses/<slug>` (outline, check marks, locks, Continue), `/members/courses/<slug>/<lesson>` (blocks; click-to-load YouTube on youtube-nocookie with chapter chips and transcript; library document cards or inline viewer; safety callouts with icon and label; checklist ticks saved as they happen; Back/Next bar). Completion rules and sequential unlock are enforced on the server (`lib/courses/progress.ts`, tested). Staff can open any course with `?preview=1` (drafts, nothing locked, nothing saved); the editor links to it. |
| P4 still to do | Video watch-percent (needs the YouTube script, so "I watched it" button for now), cached poster image, resume video position, "changed since you finished" badge, keyboard shortcuts, mobile outline sheet, tests with Postgres. |
| P5 practice | Done: `/members/practice/<testId>` (one question at a time, instant verdict, right answer and the author's feedback revealed only after answering, "review these" list, retry misses, "Take the real test" for tool tests; resumes an unfinished run). Uses the real grader (`gradeQ`) and the real question types; its own `practice_attempts` table, never `attempts` or certifications. Tags and the `practice_ok` switch live in `question_practice`, keyed by question `qkey` (published revisions are frozen, so the columns from `08` would have forced a new revision per tag change). Tool tests offer only flagged questions; a test with no tool is a standalone quiz and offers all. Author page `/admin/learning/practice`; lessons get a Quiz block (link card). |
| P5 still to do | Quiz completion rule (score >= N%), tag filter and question count on the quiz block, "back to the lesson that covers the missed topic", per-question practice-vs-real report, bulk plain-text question import/export (A6), practice attempts retention (12 months), creating standalone quizzes from the Learning admin (today a standalone quiz is a test with no tool made in Training). |
| P6 hooks (first slice) | Done: `/admin/learning/tools` links a tool to library documents (role manual/sop/safety) and courses, with the two switches `require_course` and `require_ack` (both off by default). Members see the links and progress on each tool card in Tool authorizations, plus a "Before you take the test" list. The real test refuses to start until the requirements are met (`start()` in `lib/training/attempts.ts`, after the already-passed check; an attempt already in progress is never interrupted). A requirement is ignored while courses / the library are switched off, and only documents the member can already see count (an "authorized"-tier SOP could never be satisfied by someone not yet authorized; the admin page warns about it). |
| P6 still to do | The 6-step track layout (Read, Learn, Practise, Test, Sign-off, Done) as a segmented ring, Learning panel inside the existing tool editor, public-tier library page, tool QR landing page, trainers editing their tools' courses, "new SOP version: who is affected" query and notifications. |
| Review fixes (PR 221) | Done: publishing refuses lessons nobody could finish; progress and practice writes are serialised (no lost ticks); triage keeps each document's tier; autosaves are not audited; lesson recycle bin has Restore and sections warn before taking it with them; test start looks up requirements before its transaction; course authors only see member-visible document titles and tool links need library write; outline pages and the editor no longer load every lesson's blocks; lesson size, section and lesson counts are capped and blocks past 100 are reported; revisions keep the newest 20; retention purges course/lesson trash (30 days) and practice runs (12 months); learning data is in the training export; shared admin RPC helper and one lesson-order helper; missing indexes added; DB tests cover the gate, ack, concurrency, purge. |
