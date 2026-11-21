# Moodle feature map

Verdict key: **Port** = build it. **Adapt** = build a smaller version. **Skip** = not for a makerspace.

| Moodle feature | Verdict | Our version |
|---|---|---|
| Course > section > activity tree | Port | Course > section > lesson (see `02`) |
| Page / Book / Label resources | Port | One "lesson" made of ordered **blocks** (text, video, image, file, callout, checklist) |
| URL / embedded video | Port | YouTube block (nocookie, start/end time, chapters) |
| File resource | Adapt | Library document block (reference, not upload) |
| Quiz activity | Port | Existing test engine, plus **practice mode** (see `03`) |
| Question bank, categories | Adapt | Questions already exist per revision with a stable `qkey`; add a tag filter so a practice quiz can draw by tag |
| Quiz review options (show answers) | Port | Practice shows answer + explanation per question; real tests keep current review setting |
| Activity completion (view, score, mark done) | Port | Per-lesson rules: viewed, video watched ≥ N%, quiz ≥ pass mark, "mark done" |
| Restrict access (must finish X first) | Port | Lessons unlock in order, with an override switch per course |
| Course progress bar | Port | Ring on the course card, bar in the lesson sidebar |
| Resume where you left off | Port | "Continue" button on the course card and the Learn home |
| Gradebook | Skip | We have certifications and the sign-off queue instead |
| Badges | Adapt | Course completion shows on the profile; `MakerFavor/achievements` already has an achievements style to match |
| Certificates | Skip | A certification (`certs.ts`) is the certificate |
| Forums, chat, wiki, glossary, workshop, assignments | Skip | Discord and the existing Talk/feed cover discussion; assignments are "hands-on checklist" in training |
| Enrolment methods, cohorts | Adapt | Courses are open to any approved member; optionally tied to a membership class or a tool |
| Groups / groupings | Skip | Not needed |
| Course categories | Adapt | Tags + a "Path" (ordered list of courses, e.g. Woodshop basics → Table saw → Router) |
| Course backup/restore | Adapt | JSON export/import, same as test export today |
| Course templates / duplicate | Port | Duplicate a course; start from a template (Tool safety course) |
| Learning plans / competencies | Adapt | A **Path** per shop area maps to tool authorizations |
| Reports (completion, activity) | Port | Learning reports tab: who's stuck, drop-off by lesson, quiz hardest questions |
| Notifications / reminders | Adapt | Reuse training mail + notices; "you started X and stopped" nudge, off by default |
| Mobile app | Skip | Responsive web, big touch targets, works from the shop floor on a phone |
| Offline | Skip | |
| Accessibility (captions, alt text) | Port | Required alt text (same rule as tests); captions field for videos; transcript field |
| Search | Port | Course and library full-text search (Postgres `tsvector`) |
| Multilanguage | Skip | English only, like the rest of the site |

## Things Moodle doesn't do that we want

- **Tool-first**: the unit members care about is "get authorized on the table saw", so courses attach to a tool and show the full path (read → watch → practise → test → trainer sign-off) as one progress track.
- **Shop-floor mode**: a document or lesson opens large, high contrast, with the safety callouts first.
- **SOP acknowledgement** with version tracking.
