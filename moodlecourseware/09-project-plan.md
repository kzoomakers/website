# Project plan

Sizes: S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks (one developer). Each phase ships behind a feature flag (`features().courses`, `features().library`) and as its own PR, like the training phases (#215–#219).

```
P0 foundations ─► P1 library core ─► P2 library sharing/ack ─┐
              └─► P3 courses core ─► P4 video + progress ─► P5 practice ─► P6 tool track + hooks ─► P7 nav restack & global search ─► P8 reports, polish, rollout
```
P1–P2 (library) and P3–P5 (courses) can run in parallel with two people.

| # | Phase | Size | Ships |
|---|---|---|---|
| **P0** | **Foundations**: schemas, `learning` and `library` permission sections, feature flags, audit areas, CSP for `youtube-nocookie.com`, empty nav entries (hidden) | S | Nothing visible |
| **P1** | **Library core**: upload pipeline (S3, magic bytes, thumbnail, text extract worker), folders, tags, tiers, document page with viewer, search, member browse | L | `/library` (members), `/admin/library` |
| **P2** | **Library sharing & SOPs**: share links (token, expiry, passcode, revoke, counts), QR, versioning, acknowledgements, drag reorder, triage mode, bulk edit | M | Share links, SOP read tracking |
| **P3** | **Courses core**: course/section/lesson CRUD, block editor (text, image, callout, library doc, checklist), preview as member, drag reorder, autosave, validation | L | Admin course editor |
| **P4** | **Video & progress**: YouTube block (parse, nocookie, click-to-load, chapters, transcript), completion rules, resume, member course player, outline, sequential unlock | M | Members can take courses |
| **P5** | **Practice quizzes**: tags + `practice_ok` on questions, practice engine and routes, per-question feedback, review stack, quiz block, standalone quizzes | M | Practice mode |
| **P6** | **Hooks**: `tool_docs`, `course_tools`, `require_course`/`require_ack`, tool track page (6 steps), Learning panel in tool admin, public-tier library page, tool QR landing page | M | Tool-first journey |
| **P7** | **Nav restack**: Learn group + Courses/Library tabs, move Training pages with redirects and permission aliases, grouped members menu, ⌘K search, docs find/replace | M | New menus; old URLs still work |
| **P8** | **Reports, polish, rollout**: funnel and hardest-question reports, "changed since you finished", print styles, a11y and mobile test pass, security review, seed content (one real tool end to end), flip flags | M | Launch |

Rough total: 8–10 weeks single-handed, ~5–6 with two.

## Items promoted from `10-future-phases.md` into v1 (small, but costly to retrofit)

| Item | Goes in |
|---|---|
| A1 Recycle bin (soft delete, 30-day restore) for courses, lessons, documents | P0 |
| A2 Copyright/licence flag, warning before making a manufacturer manual public or shareable | P1 |
| A3 SOP owner, review date, reminders and "overdue" report | P2 |
| A4 Learning data in the privacy export/erase | P3 |
| A7 Terms table behind auto-linking (data hook only) | P4 |
| A5 First-run guided tours | P8 |
| A6 Plain-text bulk question import/export | P5 |

Beyond P8: P9–P16 in `10-future-phases.md`. If only three extras ever get built: prerequisites (C2), progress matrix (D1), calculated questions (B5).

## Order logic

- **Library first** because it has standalone value (the board wants SOPs findable and acknowledged now) and courses reference it.
- **Nav restack late** (P7) so URLs don't move under developers mid-build. Early phases add their pages under `/admin/learn/*` and `/admin/library/*` which are already their final home. Only the *Training* pages actually move.
- Practice (P5) after the player (P4) because its natural home is the quiz block in a lesson.

## Test strategy

- Pure-logic unit tests next to existing ones in `web/tests`: block cleaning, YouTube id parsing (reject lookalike domains, `javascript:`), completion rules, sequential unlock, tier visibility, share token validity (expired, revoked, wrong passcode), position renumbering.
- DB tests following `training-schema-db.test.mjs`.
- Security tests like training phase 8: IDOR on documents and lessons, tier bypass via folder or search, share-token enumeration, path traversal in uploads, XSS in block text and filenames, practice route never returning keys for real tests, SSRF none (we don't fetch user URLs; poster is fetched only for a validated 11-char id from a fixed host).
- Mobile and a11y tests as in training phase 9.

## Risks

| Risk | Mitigation |
|---|---|
| Scope: this is two products | Library and courses ship independently behind flags; P2 and P6 are the only coupling |
| Search leaks staff-only titles | Tier filter inside the SQL, tested; never filter after the query |
| Share links leak safety/PII docs | Separate `Create share links` permission, non-public docs get `noindex`, audit log, default expiry 7 days |
| Practice lets members memorise the real test | `practice_ok` default off, distinct pool, see `03` |
| Scanned PDFs not searchable | Flagged in admin; OCR out of scope for v1 |
| Moving Training URLs breaks bookmarks/emails | 301 redirects and permission-key aliases; keep for a year |
| YouTube videos get deleted/made private | Poster is cached; player shows a "video unavailable" card with the transcript; a weekly check flags broken ones in the validation panel |
| GPL | No Moodle code or assets copied; concepts only |
| PDF text extraction cost on large uploads | Worker with a size/page cap and a timeout; flag instead of fail |

## Out of scope for v1

OCR, non-PDF documents, video upload/hosting (YouTube only), SCORM, discussion forums, gradebook, certificates PDFs, i18n, offline mode.

## Next step

The three open questions are answered (see `00-README.md`). Start P0 and P1, and P3 in parallel if there is a second person.
