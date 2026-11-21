# UX spec: the bar is "I want to use this"

Design principles, in priority order:
1. **Shop-floor first**: used on a phone, gloves off at a bench, bad light, one hand. Targets ≥ 48px, high contrast, no hover-only anything.
2. **One obvious next step** on every screen (a single primary button).
3. **Never lose work**: autosave in authoring, resume in learning.
4. **Fast**: no spinner for anything that can be a skeleton; optimistic UI for reorder, tick, bookmark.
5. **Accessible**: keyboard everything, visible focus, reduced-motion respected, colour never the only signal, alt text and captions required.

Use the existing admin styling (`webmaster.css`, `adm-*` classes) as the base so it feels like one product; the new screens set the polish level, then we lift older screens toward it.

## Member screens

### Learn home
- **Continue** hero card: course cover, "Table saw safety · Lesson 3 of 7 · 4 min left", one big button. Resumes at the exact lesson and video timestamp.
- Row **Your tools**: each tool as a card with the 6-step track as a segmented ring (Read · Learn · Practise · Test · Sign-off · Done). Tap a ring segment to jump to that step.
- Row **Paths**: "Woodshop basics" with a thin progress bar and the next course.
- Row **Recommended for you**: tools you've been booked/seen near but aren't authorized on (only if cheap; skip in v1 if it needs new data).
- Empty state is friendly and tells you what to do first.

### Course player
- Left: collapsible outline with check marks and lock icons; mobile: bottom sheet with "Lesson 3 of 7" pill.
- Centre: the lesson at a readable measure (≈ 68ch), big type, generous spacing.
- **Safety callouts** are impossible to miss: full-width, icon + label ("DANGER", "PPE"), never colour alone.
- Video: poster + play button; chapters as chips; speed control; "transcript" disclosure under it.
- Bottom bar: **Back · progress · Next** (sticky on mobile). Pressing Next with an unmet completion rule explains what's missing ("Watch 1:20 more").
- Smooth lesson transitions (view transitions API where supported, no fallback needed), confetti-free but a tasteful completion moment: ring fills, a short line ("Course done. Next: practice quiz.").
- Keyboard: ← → lessons, `t` transcript, `/` search.

### Practice quiz
- One question per screen, large; answer card flips to verdict; correct = brief green pulse + check, wrong = shake-free soft red + the right answer revealed.
- Streak, "7 of 10", and a **review stack** of misses. End screen: score ring, "Retry misses (3)", and the primary **Take the real test**.
- All ten question types work on touch (drag-onto-diagram has tap-to-place fallback; existing `question.tsx` already has the components, we wrap them).

### Library (members)
- Big search box with instant results (title, tag, and a text snippet from inside the PDF, highlighted).
- Folder tree + tag chips; grid with first-page thumbnails, or compact list (remembers choice).
- **Document view**: viewer, a sticky bar with Download / Share / Bookmark / "I've read this (v3)". Jump-to-page, in-doc search, remembers your page.
- **Scan a QR on a machine → tool landing page**: tool name, your authorization state, safety SOP first, manual, course, "Report a problem" (links to existing contact/makerfavor flow).

### Tool track page
- One page per tool: step ring at the top, each step expands in place. The step that's current is open. Locked steps say why ("Finish the course to unlock the test").

## Admin screens

### Course editor
- Split view: outline (drag to reorder sections/lessons) | lesson editor | **live preview as a member** (toggle phone/desktop width).
- Blocks added with a `/` menu or the **+** between blocks; drag handle to reorder; duplicate; per-block settings in a side panel.
- Paste a YouTube URL anywhere → becomes a video block with fetched poster and title.
- Autosave with "Saved 2s ago"; revision history of the lesson (last 20) with restore.
- Validation panel (like the test validation report): missing alt text, empty lesson, video without transcript, unreachable lesson, quiz with no questions. Publish is blocked on errors, not on warnings.
- "View as member" button impersonates read-only (no progress recorded).

### Library admin
- **Drop zone is the whole page.** Drag 30 PDFs in; they appear as skeleton cards with progress, then settle into "Needs details".
- **Triage mode**: one document at a time with the PDF on the left and fields on the right (title, tags, folder, tier, tool), `Enter` saves and moves to the next. Clearing a backlog of 80 manuals in an evening is the goal.
- Tree + grid with drag between folders; multi-select with shift-click; bulk toolbar slides up.
- Share dialog: toggle download, expiry chips, passcode, copy link (with a toast), QR; shows open count.
- "Used in" and "Who has read it" on the detail pane.

### Learning reports
- Funnel per tool: Started course → finished → practised → took test → passed → signed off, with the biggest drop highlighted and one click to the lesson or question behind it.
- Hardest questions, lessons with the most "stuck" time, stale courses (not updated in 12 months).

## Polish checklist (applies everywhere)

- Skeleton loaders matching real layout; no layout shift.
- Optimistic reorder/tick with rollback on error and a toast.
- Empty, loading, error and "no permission" states designed for every screen.
- `prefers-reduced-motion` honoured; animations ≤ 250ms.
- Dark mode if the site has it; otherwise out of scope.
- Print stylesheet for SOPs (clean black on white, QR and version in the footer).
- Lighthouse a11y ≥ 95 on the new pages; run `web/tests` mobile checks like the training phase 9 tests.
