# Gaps from Moodle we haven't planned yet

Found by reading the Moodle tree in `moodle/public/` (`mod/`, `question/`, `admin/tool/`, `report/`, `blocks/`, `availability/`, `badges/`, `ai/`, `filter/`) against `01-moodle-feature-map.md`. Same licensing rule as before: ideas only, no code copied.

Each item: **Moodle source** → what we'd build → why a makerspace cares. Value: ★★★ high, ★★ medium, ★ nice. Effort: S/M/L as in `09-project-plan.md`.

---

## A. Promote into v1 (cheap, and painful to retrofit)

These touch the schema or a legal/safety rule, so doing them later costs more than doing them now. I'd fold them into P0–P2.

| # | Gap | Moodle source | What we build | Size | Phase |
|---|---|---|---|---|---|
| A1 | **Recycle bin** ★★★ | `admin/tool/recyclebin` | Soft delete for courses, lessons, documents, folders (`deleted_at`), restorable for 30 days, purged by the retention job. Nobody should lose a safety manual to a mis-click. | S | P0 |
| A2 | **Copyright / licence flag** ★★★ | `admin/tool/licensemanager` | Per document: `source` (own work / manufacturer / third party), `licence` note, `may_share_publicly bool`. Setting tier Public or creating a share link on a manufacturer manual shows a warning and needs a confirm. Most manuals are © the maker. | S | P1 |
| A3 | **Review owner and review date on SOPs** ★★★ | `customfield`, `admin/tool/policy` | `owner_id`, `next_review_at`, reminder to the owner 30 days before, "overdue for review" badge and report. SOPs rot silently; this is the most useful thing a board asks for. | S | P2 |
| A4 | **Learning data in privacy export/erase** ★★★ | `admin/tool/dataprivacy`, `privacy/` | Add `lesson_progress`, `practice_attempts`, `lib_acks`, `lib_bookmarks` to the existing `/api/privacy` export and the erase path (`lib/privacy.ts`). Acks are kept as an anonymised count if the safety record must stay. | S | P3 |
| A5 | **First-run guided tours** ★★ | `admin/tool/usertours` | A tiny step-highlighter ("This is where you drag to reorder") shown once per user per screen, replayable from a `?` menu. Directly serves the "jaw-dropping UX" goal and cuts admin training. | M | P4 / P8 |
| A6 | **Plain-text bulk question import** ★★★ | `question/format/gift`, `aiken` | Paste or upload questions in a simple text format (multiple choice, true/false, short answer, number) into the editor; preview before saving. 40 questions in ten minutes beats clicking. Export in the same format. Also useful for backup alongside the JSON export. | M | P5 |
| A7 | **Auto-link filter** ★★ | `filter/glossary`, `filter/activitynames` | When a lesson says "riving knife" or names a tool or document, it becomes a link/tooltip to the glossary term, tool page or library doc. Pairs with B3. Do the data hook now (a terms table) and the UI later. | S | P4 |

---

## B. Learning features (next wave)

| # | Gap | Moodle source | What we build | Value | Size |
|---|---|---|---|---|---|
| B1 | **Branching lessons / remediation** | `mod/lesson` (branch tables, clusters, wrong-answer jumps) | A quiz block can say "if wrong on question X, show lesson Y". The practice end screen already links misses to lessons (see `03`); this makes the jump automatic and lets a lesson loop until understood. | ★★★ | M |
| B2 | **Interactive video** | `h5p`, `mod/h5pactivity` (Interactive Video) | Questions that pause the YouTube player at timestamps ("Which way does the blade rotate?"), resume on answer. Built on the IFrame API we already load for watch-percent. Biggest engagement gain per hour of authoring. | ★★★ | L |
| B3 | **Glossary** | `mod/glossary`, `blocks/glossary_random` | Shop terms with definitions, tags, optional photo; searchable page; "term of the day" card on Learn home; powers A7. | ★★ | M |
| B4 | **Flashcards and quick formats** | `h5p` (Flashcards, Image Hotspots, Drag the Words, Sequencing) | Blocks: flashcards (tool parts, hand signals, wire colours), image hotspots (click each part to read about it), reveal cards. We already have hotspot and drag question types; this adds *non-graded* learning versions. | ★★ | M |
| B5 | **Parametrised "calculated" questions** | `question/type/calculated*` | Number questions with random values each attempt and a formula for the answer: "Feed rate for a 6mm cutter at 12,000 RPM, 2 flutes, 0.05 mm chip load". Machining and CNC training needs it; also unit-aware ("mm" vs "in"). | ★★★ | M |
| B6 | **More question types** | `gapselect`, `multianswer`, `essay`, `description`, `randomsamatch` | Dropdown-in-sentence blanks, embedded mixed-type ("cloze") questions, **essay with manual grading** (goes to the existing sign-off queue as a trainer task), and a **description item** (text/image between questions with no score; Moodle's "information item"). | ★★ | M |
| B7 | **Hints and multiple tries in practice** | `question/behaviour/interactive`, `adaptive` | Practice mode: first wrong answer gives a hint and lets you retry for reduced credit; second reveals. Uses the question's feedback; no new grader. | ★★ | S |
| B8 | **Confidence-based marking** | `question/behaviour/*cbm` | In practice: "How sure are you? low / medium / high". *Confidently wrong* answers are flagged red and re-queued. For safety learning, "certain and wrong" is the dangerous case. | ★★★ | S |
| B9 | **Hands-on assignment with rubric and evidence** | `mod/assign`, `grade/grading` (rubrics, marking guides) | Extends the (currently advisory) hands-on checklist: the member uploads a photo or short clip of a first project, the trainer scores a rubric (setup, PPE, technique, cleanup), result goes on the cert event. Promote from advisory to required per tool. | ★★★ | L |
| B10 | **Lesson feedback and course surveys** | `mod/feedback`, `mod/choice` | 👍/👎 + optional comment on each lesson ("this was unclear"), end-of-course 3-question survey, and a quick poll block. Feeds the "stuck lessons" report. | ★★ | S |
| B11 | **Lesson Q&A** | `comment/`, `rating/`, `mod/forum` (Q&A forum) | A moderated "Ask a question" thread under each lesson. Trainers answer; answers can be promoted into the lesson as a callout ("FAQ"). Could also post to the feed/Talk later. | ★★ | M |
| B12 | **Peer show-and-tell** | `mod/workshop` | Members post a project photo against a course ("my first dovetail"), others react. Low-effort community/retention feature; skip structured peer grading. | ★ | M |

---

## C. Certification, rules and automation

| # | Gap | Moodle source | What we build | Value | Size |
|---|---|---|---|---|---|
| C1 | **Supervised test mode** | `mod/quiz/accessrule/{ipaddress,password,timelimit,openclosedate}` | Per test: "kiosk only" (allowed IPs or the shop network) and/or a proctor code entered by a trainer, plus open/close window. Lets a test double as a witnessed assessment. (Skip Safe Exam Browser and secure-window rules.) | ★★ | M |
| C2 | **Prerequisites and release conditions** | `availability/condition/{completion,date,profile,group,grade}` | "To see the CNC course you must be authorized on the Bandsaw" (`tool_auths`), or "membership class = Full", or "available from 1 Dec". One small condition list on courses, lessons and library documents, evaluated by one function. | ★★★ | M |
| C3 | **Auto-assign by cohort** | `cohort/`, `admin/tool/cohortroles`, `enrol/cohort`, `enrol/self` | Rules: "everyone who joins gets *Orientation*", "members with class X get *Basics*", plus self-enrol toggle. Assignments show on Learn home with an optional due date and reuse the existing rollout/reminder machinery. | ★★★ | M |
| C4 | **Event rules and alerts** | `admin/tool/monitor` | "Notify trainers when a member fails the same test 3 times", "weekly digest of stuck members", "when an SOP is updated, notice to authorized members". A small `when → then` table over events we already log; reuses `lib/training/notify.ts` and Pushover. | ★★ | M |
| C5 | **Completion automation** | `completion/`, `enrol/` | On course complete: add a profile badge, unlock the next course in a path, drop a message in Discord via the existing outbox. | ★★ | S |
| C6 | **Generalised policy acceptance** | `admin/tool/policy` | Same table as SOP acknowledgements, used for Code of Conduct, Guest Policy, new safety rules: versioned, with "must accept to continue" for members (the waiver flow already exists; this is the lightweight sibling). | ★★ | S |
| C7 | **Paid classes and courses** | `payment/`, `enrol/fee` | Charge for in-person classes or premium courses via the PayPal integration you already have connected. Needs a receipt/refund path; only worth it if classes carry fees. | ★★ | L |
| C8 | **Classes ↔ courses** | `enrol/`, `calendar/` | A scheduled in-person Class gets a *prep course* (do before you arrive) and a *post-class quiz*; attendance marks the hands-on step done. Links two things that are separate today. | ★★★ | M |
| C9 | **Badges with criteria, shareable** | `badges/criteria/*`, Open Badges | Criteria: complete a course set, hold N authorizations, manual award, profile fields. Issue as Open Badges 3.0 so they can go to LinkedIn. Match the look of MakerFavor achievements. | ★★ | M |
| C10 | **Skills / learning plans** | `competency/`, `admin/tool/lp` | Map course + tool authorizations to the existing **Skills** list; a member picks a goal ("build a cabinet") and gets a suggested plan; admin sees skill coverage across members (who can teach what). | ★★ | L |

---

## D. Reporting and insight

| # | Gap | Moodle source | What we build | Value | Size |
|---|---|---|---|---|---|
| D1 | **Progress matrix** | `report/progress` | Grid: members down, lessons/steps across, cells coloured by state, click to nudge or override. The single most-used Moodle teacher view. | ★★★ | M |
| D2 | **Question item analysis** | `mod/quiz/report/statistics` | Facility index (how many get it right), **discrimination index** (does it separate people who know from those who don't), distractor analysis. Flags broken or misleading questions automatically. Extends the question analytics already in training phase 7. | ★★ | M |
| D3 | **Saved custom reports + CSV** | `reportbuilder/` | Pick a source (members, progress, attempts, acks, library opens), choose columns and filters, save, export CSV. Replaces one-off report requests. Keep it to fixed sources; no free-form SQL. | ★★ | L |
| D4 | **Live "who is in the course"** | `report/loglive`, `blocks/online_users` | Trainers see, during a class night, who is working through what right now ("Sam is on Q7 of the router test"). Only with a clear opt-in (privacy). | ★ | S |
| D5 | **At-risk detection** | `analytics/`, `report/insights` | Simple rules (not ML): started and stalled 14 days, authorization expiring, failed twice. One list for trainers with a one-click nudge. | ★★ | S |
| D6 | **Activity timeline per member** | `report/outline`, `report/log` | A member's learning history in one scroll, for trainers deciding on a sign-off. Extends `cert_events`. | ★★ | S |
| D7 | **Library usage** | `report/log`, `mod/resource` views | Most-opened documents, searches with no result (shows missing manuals), documents nobody opens (candidates to archive). | ★★ | S |

---

## E. Authoring and platform

| # | Gap | Moodle source | What we build | Value | Size |
|---|---|---|---|---|---|
| E1 | **AI-assisted authoring** | `ai/` (providers, actions, rate limiter, placements) | Buttons using the existing `lib/ai.ts`: "Draft quiz questions from this SOP", "Suggest tags and title for this upload", "Summarise this manual into a one-page cheat sheet", "Alt text for this image". **Rules: output is always a draft, a human publishes it, safety content shows a "AI-drafted, not yet verified" banner until a trainer signs it off, rate-limited, logged in audit.** | ★★★ | M |
| E2 | **Shared question bank** | `mod/qbank`, `question/bank/*` | Today questions are copied per test revision. A bank (categories + tags + "where used" + history) lets "PPE basics" questions be reused across tools and fixed in one place. Needs care to keep published revisions immutable (copy-on-publish from the bank, keep `qkey`). | ★★ | L |
| E3 | **Reusable content** | `contentbank/` | Save a block or lesson as a **snippet** (e.g. the standard lockout/tagout section), insert elsewhere as a copy or as a live reference. | ★★ | M |
| E4 | **Course import/export packages** | `backup/`, `admin/tool/uploadcourse` | Zip with JSON + media (the current plan is JSON only); CSV bulk-create of courses/library entries from a manifest. Also opens the door to **sharing courses between makerspaces**. | ★★ | M |
| E5 | **Accessibility checker** | `admin/tool/brickfield`, `blocks/accessreview` | Beyond alt text: heading order, link text ("click here"), contrast on callouts, video without captions, scanned PDF without text. Shown in the existing validation panel with a score. | ★★ | M |
| E6 | **Custom fields** | `customfield/` | Admin-defined fields on documents (machine model, serial, manufacturer, location) and courses; searchable and shown in lists. Small JSON column, not an EAV system. | ★★ | S |
| E7 | **Favourites and recents** | `favourites/`, `blocks/recentlyaccesseditems`, `blocks/starredcourses` | ⭐ on courses and documents; "Recently opened" and "Starred" rows on Learn home and Library. | ★★ | S |
| E8 | **Learn home widgets** | `blocks/timeline`, `blocks/myoverview`, `blocks/completionstatus` | Timeline of what's due (re-pass deadlines, class dates, SOP re-reads), calendar-feed export (the site already has `lib/calendar-feed.ts`). | ★★ | S |
| E9 | **Outbound webhooks and read API** | `webservice/`, `lib/classes/hook` | Events (course completed, doc published, ack recorded) POSTed to configured URLs; read-only API behind the existing API keys. Lets the door system or a kiosk react. Reuse the `outbox` table. | ★ | M |
| E10 | **Short self-hosted clips** | `media/`, `mod/resource` | Upload a ≤ 60 s phone clip (tool demo) when a YouTube upload is overkill; transcode to MP4/WebM in a worker, require captions. Storage and cost heavy: only if people ask. | ★ | L |
| E11 | **Embed external tools (LTI)** | `mod/lti`, `enrol/lti` | Let a lesson embed a third-party exercise. Real but rare; defer unless a partner needs it. | ★ | L |
| E12 | **Notification preferences** | `message/` | Each member chooses email / in-app / none per type (course updates, SOP changes, nudges). Matches the privacy posture; add before nudges ship. | ★★ | S |

---

## F. Things from Moodle we're deliberately leaving out

SCORM/IMS packages, gradebook and grade letters, forums and chat as standalone products, BigBlueButton live classes, Matrix/other chat bridges, mobile app and offline mode, Mahara/portfolio export, MNet networking, themes, multilanguage packs, Safe Exam Browser, plagiarism plugins, wiki. Each either duplicates something we already run (Discord, Talk feed, SignDocs, the blog) or serves a school, not a makerspace.

---

## Proposed future phases

Order is by value per unit of effort and by dependency on the v1 phases in `09-project-plan.md`.

| Phase | Theme | Items | Size | Depends on |
|---|---|---|---|---|
| **P9** | **Smarter practice** | B5, B6 (non-essay), B7, B8, A6 if not already done | M | P5 |
| **P10** | **Prerequisites and auto-assign** | C2, C3, C5, C8, E12 | L | P4, P6 |
| **P11** | **Insight** | D1, D2, D5, D6, D7, E8 | M | P8 |
| **P12** | **Engaging content** | B2 (interactive video), B3, B4, B10, E7 | L | P4 |
| **P13** | **Real hands-on assessment** | B9, C1, B6 essay (manual grading) | L | P6 |
| **P14** | **AI assist and content reuse** | E1, E3, E5, E6 | M | P3, P5 |
| **P15** | **Recognition and community** | C9, C6, B11, B12, C4 | M | P10 |
| **P16** | **Platform** | E2, E4, E9, D3, C10, C7 (if classes are paid) | L | any |

If only three of these ever get built, build **C2 (prerequisites), D1 (progress matrix) and B5 (calculated questions)**: they change daily use the most for the least cost.

## Decisions to make later (not now)

1. Should practice draw from a **shared question bank** (E2) rather than test revisions? This is the one choice that is hard to undo; v1 keeps copies per revision and the plan above stays valid either way.
2. Are classes ever **paid** through the site (C7)? Decides whether payments are in or out for the next year.
3. Do trainers want **proctored/kiosk tests** (C1), or is the hands-on sign-off enough?
