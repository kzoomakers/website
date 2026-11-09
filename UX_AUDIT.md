# UX Audit: `/admin`, `/members`, `/account`

Audit date: 2026-11-08 · Branch: `fix/inbox-bubble-contrast` · Scope: `web/app/admin/**` (150 files), `web/app/members/**`, `web/app/account/**`, shared `web/components/{dialog,flash}.tsx`, and the shared stylesheets `admin/webmaster/webmaster.css` and `admin/mail/mailadmin.css`.

## How to read this audit

**This is a code-inspection audit. The app was not run and no browser testing was done.** Every finding cites the implementation that produces it. Confidence tags:

- **Verified**: the behaviour follows directly from code I read (a missing attribute, a CSS rule, a hard-coded string).
- **Strong inference**: the code makes the outcome very likely but it depends on runtime behaviour I did not observe (e.g. Next.js navigation timing).
- **Needs validation**: a plausible risk that needs a browser, a screen reader, or real users.

Contrast ratios were computed by hand from the CSS tokens. Re-check them with a tool before changing colours.

Not read in full: the Puck page editor under `/edit/*` (outside the three routes), the mail template editor internals (`admin/mail/editor.tsx`), and the guided-page editors beyond their save and unsaved-changes handling. Findings about those are limited to what shows at their edges.

---

## Executive Summary

The three areas share a visual shell (top bar, left menu, bevelled frame) but not a UX language. Each section was built as its own mini-product, and the seams show.

**Systemic weaknesses**

1. **The admin IA is organised by the codebase, not by the work.** Nine top-level tabs, named inconsistently (tab "Admin" → page "People & access" → menu "Services"; tab "Postmaster" → URL `/admin/mail`; tab "Forms" vs. Postmaster's own "Forms"). Page titles, tabs, menu items and URLs disagree for nearly every section. The Webmaster menu is a four-level hover flyout (`Pages › Guided › Learn More › About Us`).
2. **The first screen after sign-in is an animated illustration with no content.** `/admin/landing` shows nothing actionable and animates forever with no reduced-motion guard. Meanwhile the *real* "what needs me" signal is a blocking modal that fires on every admin page.
3. **Destructive and irreversible actions are handled four different ways.** Custom dialog with a red button, custom dialog with a neutral button, native `window.confirm()`, and no confirmation. Delete buttons are red at rest, red on hover only, or not red at all. There is no undo anywhere. Almost every removal asks for confirmation, including removals that are reversible by not saving.
4. **A keyboard-inaccessible control pattern ships in Postmaster.** Row actions (Edit, Trash, Delete) are `visibility:hidden` until mouse hover on desktop, so keyboard users cannot reach them (WCAG 2.1.1).
5. **Feedback and loading are ad hoc.** No `loading.tsx` anywhere. Roughly 76 hand-placed `role="status"/"alert"` elements with three different styles. Silent failures on several mutations. Only one editor warns about unsaved changes.
6. **Developer vocabulary leaks into admin copy:** `slug`, `robots.txt`, `ntfy`, `HTTP log`, `Postgres stats`, `ADMIN_EMAILS`, `CHORES_API_KEY`, `SMTP2GO`, `Debug`, IP and user-agent strings.
7. **There is no shared component layer.** About 750 inline `style={{` blocks; five button vocabularies (`pri`, `primary`, `btn btn-main`, `danger`/`bad`/inline red, `seg`); at least five date formats; four different "tab" implementations; some classes (`primary`, `bad`) with no rule in the admin stylesheet.
8. **`/members` and `/account` read as two apps.** The member Home is a plain list, Chores is a gamified confetti dashboard with its own embedded stylesheet and a 4-hour goal hard-coded, and Account is a long unstyled form stack. "Notifications" names five different things.

**Highest-value improvements**
(IDs refer to the findings table below.)

- Make Postmaster row actions keyboard-reachable (A-01), ten minutes of CSS.
- Replace the landing illustration with a "needs attention" panel and demote the global blocking modal (A-02, A-03).
- One destructive-action pattern and one undo or soft-delete rule (X-01, X-02).
- Rename and regroup the admin IA; write a single section-name table and apply it to tab, menu, `<h1>`, `<title>` (X-03, A-04, A-05).
- Add `<title>` metadata to every admin page. None exists (X-04).
- Give `/members` Home and `/account` a task-first layout (M-01, C-01, C-02).

---

## Findings by Route

### `/admin` shell, shared by every admin page

| Where | Observation | Evidence |
|---|---|---|
| Landing `/admin/landing` | Full-viewport dark illustration inlined from `public/admin-brain.svg`. No links, no counts, no text. If the SVG file is absent the page is empty (`readFile(...).catch(() => "")`). `landing.css` animates `#lighting`, `#lighting-glow`, `#charge-rect` with `infinite` and contains no `prefers-reduced-motion` rule. | `admin/landing/page.tsx`, `landing.css` · **Verified** |
| `/admin` | `redirect()` to `/admin/landing`, which `redirect()`s again to login if there are no perms. Two hops and a double permission check. | `admin/page.tsx`, `landing/page.tsx` · **Verified** |
| Top bar | Tabs come from `tabs.ts`: Webmaster, Postmaster, Blog, Forms, CRM, Signed Docs, Tours, Chores, Admin. Section identity is repeated by a rotated corner ribbon in a different colour per section. Ribbon text is white on `#65a30d` (≈3.1:1), `#d97706` (≈3.2:1), `#0891b2` (~3.7:1), `#e11d48`; 13px bold, so AA is not met. It duplicates the active tab, so it is decoration that costs contrast and phone space (hidden below 720px). | `admin-bar.tsx`, `tabs.ts` · **Verified** (ratios computed) |
| Active-tab logic | `cur = tabs.find(h => here.startsWith(h) …)`. Special-cases `/admin/services` to light "Admin". Any path-prefix collision breaks it silently. | `admin-bar.tsx:11` · **Verified** |
| Left menu | `MENUS.find(([p]) => here.startsWith(p))`. `/admin/users` and `/admin/services` both map to the same `USERS` list, which mixes People & access with 10 developer-ops pages (Debug, HTTP log, Postgres stats, Security headers…). | `nav.tsx` · **Verified** |
| Webmaster menu | Flyouts nest up to 4 levels (Pages › Guided › Learn More › About Us) and open on hover/focus-within. Moving diagonally from parent to child can close the flyout (the gap is `left:calc(100% - 4px)`). On desktop the group `<button>` has `aria-haspopup` but its click handler only toggles a class used on phones. | `nav.tsx`, `webmaster.css:21-22` · **Verified** (hover fragility: Needs validation) |
| Menu icons | Emoji as icons with *reused meanings*: 👥 = Board, People, Subscribers; 📝 = Posts, Forms; 🔔 = Tour notifications, ntfy; 📊 = two different Stats; 🕘/🕙 for Audit, Timeline and Availability; 🧭 appears twice in the same menu (Guided, Explore Us). Emoji render differently per OS. | `nav.tsx` · **Verified** |
| Sidebar height | `.adm-side{position:sticky;height:calc(100vh - 76px)}` with no `overflow`. The Services menu has 11 items plus view-site plus account. On a short laptop viewport the account menu can be pushed off-screen. | `webmaster.css:8` · **Needs validation** |
| Alerts modal | `alerts.tsx` polls `/api/webmaster/alerts` every 60 s and, if there is anything newer than a per-browser `localStorage` marker, shows a full-screen `role="alertdialog"` on *every admin page* except four. Contents: reviews, comments, applicants, held forms. "Review now" is `<a><button>` (interactive content nested in a link). No focus trap, and the page behind is not `inert`; Escape means "Got it". The acknowledgement is per browser, not per person, so a second admin sees it again. It reappears as soon as one new item arrives, including mid-task. | `alerts.tsx` · **Verified** |
| User menu | `role="menu"` on a plain div; no arrow-key navigation, no Escape, no outside-click close. Contains "Phone notifications" and "Log out" only. No link to the member's Account or Members area. | `user-menu.tsx` · **Verified** |
| Cross-area links | Members → Admin exists ("🛠️ Admin panel" in the sidebar). Admin → Members/Account does not. | `members/chrome.tsx`, `admin/nav.tsx` · **Verified** |
| Document titles | No `metadata` export in any admin file. Every admin tab and window shares one title (whatever the root layout gives). Members and Account pages *do* set titles. | `grep metadata` over `admin/` returns nothing · **Verified** |
| Errors | `error.tsx` is good: it keeps the chrome, shows a digest, and has a Retry. But it tells people to "tell the webmaster this code" with no copy button or contact. | `admin/error.tsx` · **Verified** |
| Loading | No `loading.tsx` in `admin/` or `members/`. Every page is `force-dynamic` and hits the database. | filesystem · **Verified**; navigation lag: **Strong inference** |
| Read-only | `ReadOnly` wraps sections in `<fieldset disabled>` with a single banner. Disabled buttons are indistinguishable from "broken" (opacity .4) and there is no per-control explanation. | `read-only.tsx` · **Verified** |

### `/admin/webmaster`

- **Pages** (`pages.tsx`): list plus search, "All pages | Deleted" tabs, duplicate and delete. Error copy exposes **"slug"** ("Bad slug: foo bar") and the `ask()` prompt does too. Creating or editing a page calls `location.assign('/edit/<slug>')` and leaves the admin chrome entirely for the Puck editor; the way back is unverified. The two segmented controls are `role="tab"` + `aria-pressed`, which is an invalid ARIA combination (tabs need `aria-selected`, `tabpanel`, arrow keys). **Verified**.
- Menu labels: "Custom" (free-form Puck pages) vs "Guided" (form-driven pages). Neither word tells an editor which to pick for a new page. The nested group "Learn More" also holds "Financials" and "Why join us?" next to "About Us". **Verified**.
- Guided editor: the only editor in the app with a `beforeunload` guard and a sticky `.savebar`. Good pattern, used nowhere else (see X-07).
- Site Config: `robots.txt` as a menu item is a developer concept shown to office volunteers. Hours, Menu and robots each have a separate page and separate save button.
- Reviews and Comments: both are moderation queues, in different sections (Webmaster › Reviews, Blog › Comments), with similar-but-different UIs and a shared alerts modal.

### `/admin/mail` (Postmaster)

- **A-01, keyboard trap:** `.mp-act{visibility:hidden}` and `.mp-table tr:hover .mp-act{visibility:visible}` (`mailadmin.css:6-7`). Only the ≤820px query overrides it (`:16`). `visibility:hidden` also removes the controls from the tab order. There is no `:focus-within` rule. Edit / Trash / Delete on emails, subscribers, forms and lists are unreachable by keyboard on desktop. **Verified.**
- **Native `confirm()`** for list delete (`mail-admin.tsx:87`), subscriber erase/delete (`subscribers.tsx:34,36`), email delete forever and send-now (`emails.tsx:36,175`), template delete (`emails.tsx:121`), form delete (`forms.tsx:63`). Everywhere else uses the styled `confirmDialog`. The native dialog cannot be styled, cannot name the action on the button, and "Send … to about N people now? This can't be undone." is the highest-stakes confirmation in the product and gets the weakest UI. **Verified.**
- "Queue › Delete all" uses `confirmDialog` *without* `danger: true` (`mail-admin.tsx:151`), so the one custom dialog that deletes everything pending has a blue primary button. **Verified.**
- `emails.tsx:121` and sibling handlers reload with `location.reload()`, dropping scroll position and any selection. **Verified.**
- Name collision: Postmaster › **Forms** (signup forms for newsletter lists) vs the top-level **Forms** tab (contact-form inbox). **Verified.**
- Postmaster menu "Home" is a dashboard of six stat cards. The only action on it is a "New email" link styled as `pri` *inside the `<h1>`* (`mail-admin.tsx:49`). Same pattern (buttons inside headings) on Subscribers, Lists, Forms, Queue and Emails: the accessible name of every such heading includes the button label. **Verified.**
- Settings copy exposes "SMTP2GO API key", "any SMTP server", webhook instructions ("In SMTP2GO go to Settings → Webhooks…"), and a `smtps://user:password@…` placeholder. Appropriate for whoever configures it, but it sits in the same menu as day-to-day Emails and Subscribers. **Verified.**
- Warning banner when sending isn't configured is good in intent but uses emoji and an em dash plus 3 sentences of explanation; it shows on every Postmaster screen rather than only where sending is attempted.

### `/admin/blog`

- Menu: Posts, Categories, Authors, Media, Comments. "Authors" and "Categories" are reference data used by one screen, the post editor. They get top-level menu entries and a generic `lookup.tsx` whose `<h1>` is built by `noun[0].toUpperCase() + noun.slice(1) + "s"`. Fine, but they could live as pickers inside the post editor. **Strong inference.**
- Blog Comments moderation: "Delete this comment and all replies under it for good?" and "Permanently delete everything in Spam?" use `danger` correctly; there is no bulk approve. **Verified** (`moderation.tsx:19,24`).
- Post editor: no unsaved-changes guard found. **Verified** (grep for `beforeunload`: one file in the whole tree). Whether the editor autosaves was not confirmed: **Needs validation**.

### `/admin/forms`

- `inbox.tsx`: tab "**Spam / held**" vs row label "**Held**" vs alerts modal "**held by the spam filter**" vs sidebar "**Inbox**" vs `<h1>` "**Forms**" vs top tab "**Forms**". Four names for the same queue.
- The tab bar is `<nav class="bar">` of `aria-pressed` buttons plus a `<select>`, with the *current tab shown only as bold text* (`style={tab === k ? { fontWeight: 700 } : undefined}`). Bold alone is weak as a selected state. **Verified.**
- `load()` does `await (await fetch(...)).json()` with no `r.ok` check; `del()` ignores a failed DELETE. Network or server errors leave stale rows or throw. **Verified** (`inbox.tsx:12-14, 23-25`).
- Per-row shows an "Approve & send" primary, "Reject", and a red "Delete" side by side on every row; the destructive button is as prominent as the primary one on a spam-filter queue where *Delete* is the most common action.
- Message body is rendered in full for every row (no collapse), so a flood of spam makes the page very tall. No bulk "Reject all/Delete all spam"; compare Blog Comments, which has "Empty spam". **Verified.**

### `/admin/crm`

- Menu: People · **New members** · **Membership agreement** · Skills · **Profile values** · **Tools & authorizations** · Classes. Reference-data pages (Skills, Profile values, Tools) are peers of the daily-use queue (New members) and the legal document (agreement).
- `<h1>` for the agreement is "Membership agreement & liability waiver"; the menu says "Membership agreement"; the route is `/admin/crm/waiver`; the members' account section says "Membership agreement & liability waiver". Three names (agreement, waiver, liability waiver).
- **People** (`people.tsx`) is the main list; **People & access** (`users/users.tsx`) is a different list of the same people with permission selects. Both link to the same CRM person page. Two people lists with different search fields (CRM: name, email, phone, card, QuickBooks ID; Users: name or email).
- Person page (`people/[id]/member.tsx`): "Details" form lists 12+ fields as one flat grid; admin actions (Send password reset, Set password, Disable, **"Delete this person…"**) are in a bottom card, in a stack with equal visual weight except the red text on delete. "Set password" is an `<input type="text">` that shows the typed password and then asks you to "Tell them the new password", which pushes admins into sharing passwords out of band. **Verified.**
- `Details`, Notes, Extras and Contacts are all on one scrolling page with no in-page navigation; Contacts are read-only here (admins can't fix a wrong emergency number) while the member can edit them in Account. **Verified.**
- Approvals (`approvals.tsx`): tab labels "Needs us / Waiting for reply / Rejected / Approved" and an internal `LABEL` map "Pending / Waiting / Rejected / Approved". The alerts modal says "waiting for approval", the compact heading says "awaiting approval", the member sees "Application status". `ago()` here prints `3d` while the shared helper prints `3d ago`. **Verified.**
- The canned replies array is a nice shortcut, but it is limited to three hard-coded questions.

### `/admin/users` and `/admin/services`

- `UsersPage` stacks four unrelated things: a sign-up rate counter, the **member approval queue** (compact), the **permissions matrix**, and **API keys**. A person looking for "approve someone" lands on "People & access" only if they know it is there; the real home is CRM › New members. **Verified.**
- Permissions matrix (`users.tsx`): `<table>` with one `<select>` per section per person: 9 section columns × N rows, `overflow-x:auto`. No presets ("Treasurer", "Webmaster"), no bulk edit, no confirmation or undo on lowering your own co-admin's access, and a change applies immediately on `onChange`. The `title` on the founder tag is the only explanation of why that row's selects are disabled. **Verified.**
- Microcopy leaks: "Google logins listed in ADMIN_EMAILS are always full administrators…" and API-key help: "paste it into YAMNet's Settings › System as `CHORES_API_KEY`, with this site's address as `CHORES_API_URL`." **Verified.**
- Signup counter sentence ("Sign-ups this hour: 3 of 20 … Reset counter") appears above the page title, before the `<h1>`, as the first thing on the page. **Verified.**
- Services section: Audit log, Notifications (ntfy), AI, Debug, HTTP log, Postgres stats, External links, Privacy statement, Security headers. Two of these (Privacy statement, External links) are *public content* and belong under Webmaster. The rest are operator tooling under the same "Admin" tab as access control. **Verified.**
- First-run setup form (`services/form.tsx`): "Postgres", "S3-compatible storage", "CA certificate (optional; Aiven provides one)". Presented to whoever owns the site on day one; acceptable for an installer, but the same page title ("Services") is also the permanent settings page. After success it redirects to **/admin/webmaster** after a hard-coded 1.2 s `setTimeout`. **Verified.**

### `/admin/signed-docs`

- Menu: **Papers**, **New paper**, **Templates**, **Buckets**. Tab says "Signed Docs"; `<h1>` says "Signed docs" (with a "● live · 14:02:11" timestamp inside the heading, which a screen reader reads as part of the title); items are called "papers"; the stored thing is a "document" in error copy ("Void "{title}"?"). "Bucket" is storage jargon for what is a folder or category. **Verified.**
- `new-paper.tsx` is a ~150-line single page with five fieldsets and ~20 inputs. Ordering: Template → Title → Document → People → Fields → Details and options. Sensible, but it exposes advanced options at the same level as essentials (sign in order, quorum, per-signer passwords, "Leave the signing-certificate page off the finished PDF", redirect URL). No progressive disclosure. The "Add person" row asks for "name" and "email (blank = template slot)". **Verified.**
- Field-type buttons ("signature", "text", "initials"…) are lower-case raw keys from `Object.keys(SIZE)`. **Verified** (`new-paper.tsx` Fields bar).
- On success the page replaces itself with only a status line and two links; the new paper is not opened. **Verified.**
- No unsaved-changes guard on a long form that includes an uploaded PDF and hand-placed fields. **Verified.**

### `/admin/tours`

- Menu: Bookings · Walk-ups · Availability · Stats · Timeline · Notifications. `<h1>`s: "Tour bookings", "Walk-up tour requests", "Tour availability", "Tour stats", "Tour timeline", "Tour notifications". Menu and heading differ ("Walk-ups" vs "Walk-up tour requests"; "Bookings" vs "Tour bookings").
- Bookings row shows client IP, screen size and user-agent string ("Device: 203.0.113.9 · 1440x900 · Mozilla/5.0…") to anyone with Tours access, at 12px in the middle of the card. This is personal data with no apparent task use. **Verified** (`bookings.tsx`).
- Date formats: `en-US` hard-coded for dates and times here, `[]` (browser locale) elsewhere. **Verified.**
- "Cancel tour" confirm dialog has Cancel and "Cancel tour" buttons side by side. A reader can easily confuse which cancels the cancellation. **Verified** (`bookings.tsx:16`; `dialog.tsx` always renders "Cancel").
- "Include past tours" is a checkbox in a `<nav>`: wrong landmark. **Verified.**
- "Take back the offer" and "Dismiss" are described well, but the two use different verbs for similar outcomes.

### `/admin/chores`

- Admin menu "To do / Hours log / Stats / Achievements" vs member view tabs "To do / Hours / Achievements / Standouts". "Stats" ↔ "Standouts", "Hours log" ↔ "Hours". The admin view is a CRUD list; the member view is a gamified dashboard. Differences in names for the same data. **Verified.**
- Chore delete is labelled "Put away" in the dialog but "Delete" elsewhere in the section (`todo.tsx:16` vs `log.tsx:19`).
- Uses `className="primary"` (8 uses across chores and API keys) while the admin stylesheet defines `.pri`. I found no `.primary` rule in `webmaster.css` or `mailadmin.css`. If the site's global CSS doesn't define it either, those buttons render unstyled. **Strong inference; Needs validation.**

### `/members`

| Page | Observation |
|---|---|
| Chrome | Top bar has a **single** tab, "Members", which is also highlighted on `/account`. It carries no navigation value and wastes a row. Sidebar: Home · Directory · Classes · Chores · My Profile · Inbox · Phone alerts · Account. |
| Home (`page.tsx`) | `<h1>` "Members area" while the nav item is "Home". Then "Welcome, Jane." Then three `<h2>` lists (membership, tool authorizations, classes) with no actions on any of them. Footer line of three links is the only wayfinding: "Find a member with a skill · Edit your profile and skills · Phone notifications". `new Date(l.since).toLocaleDateString()` prints a bare numeric date. Expired authorizations are flagged with hard-coded `#b00020` text and the word "expired" (OK) but no way to re-authorize or find out how. |
| Unapproved users | `<h1>Welcome</h1>` + `<Status />`, outside `MembersShell`, so the `<h1>` styling and the redirect behaviour differ. Sidebar collapses to Home + Account. |
| Directory | Title "Member directory" / nav "Directory". Search box + up to 7+ `<select>` facets + level + Clear; result count in `aria-live`. Bio expand is a `<p onClick>` with `title="Click to expand"` and `cursor:pointer`: **not keyboard accessible** (no role, no tabindex) **(Verified, `directory.tsx`)**. `Message {first}` opens an inline form in the card; the send-result `msg` is rendered at the *top of the list*, not near the card, so on a long list the confirmation scrolls off-screen. The hint "They'll get it in their inbox here and by email" is accurate but lives only in a placeholder (disappears on typing). The 60-row cap is explained in small print. Contact details (phone/email) can be rendered as bare links with no label. |
| Profile | Collapsible `<details>` sections ("Sec"), each with an `<h2>` *inside `<summary>`*, which is invalid (summary allows phrasing content) and flattens heading semantics. Autosaves after 900 ms; status line at the bottom of a very long form ("✓ All changes saved"). The visible "ON/OFF" label on `Tgl` is `aria-hidden` (fine) but the switch glyphs are "I" and "0"; the real label is far to the right. On failure the message is "Will retry on your next change", which means nothing is retried until the user edits again, and there's no way to know which field failed. **Verified** (`profile.tsx:79-85`). The same form has "List my email in member directory" ×3 phrasings of the same privacy concept. |
| Classes | Separate `classes.css`. Posters, signup, waitlist, "propose a class" with image upload. Date/time use `[]` locale with long formats. Not reviewed beyond structure; **Needs validation**. |
| Chores (member) | 219-line component embedding a `<style>` block with its own hover lifts, rotating icons, confetti, shimmer and `chPulse`. Honours `prefers-reduced-motion` (good) but the confetti and toast are not announced beyond `role="status"`. Tab strip is `<nav class="bar chips">` of `aria-pressed` buttons. 4-hour monthly goal is a hard-coded constant (`GOAL = 4`) shown to every member as "🎯 N to your 4h goal", an unexplained policy. The fallback greeting is "friend". Emoji moods (🔥 😌 🎈) encode urgency, with colour on a 5px left border as the other signal. |
| Inbox | `<h1>Inbox</h1>` mixes two lists: conversations with members and "other notices". Opening the page **marks notices read as a side effect of a GET render** (`markRead` in the server component), after computing which ones were new; a prefetch, refresh or a second tab will silently consume the unread state. Link for a notice without `url` is `href="#"`. Unread dots are colour + glyph only (`●` vs `✉`) with no text. |
| Conversation | Bubble colours are hard-coded light backgrounds and `#1a1a1a` text: the fix in the last two commits. Timestamps use `toLocaleString()` with no format. A "← Inbox" back link is a plain anchor (full page load; the rest of the app uses `<Link>`). |
| Phone alerts | Nav "Phone alerts", page `<h1>` "Phone notifications", user-menu link "Phone notifications", Account link "Set up phone notifications", Admin Services page "Notifications (ntfy)". The same feature has up to five labels and two URLs (`/notifications`, `/members/notifications`). |
| Envelope | Bell/envelope menu with `role="menu"` but no arrow-key support or Escape (only `mousedown` outside closes it). Badge is white 11px on `#d97706` ≈ 3.2:1. "See all" goes to Inbox, which then doesn't show member-message notes (they are filtered). |
| Onboarding | Good that the server refuses skipped steps. The `profile` step redirects to `/account?setup=1&next=%2Fmembers`, i.e. onboarding is split across two UIs with different styling and different required-field markers. |

### `/account`

- `account/layout.tsx` re-exports the members layout, so **Account lives inside "Members"**. The sidebar has it as the last item; the top-bar tab "Members" is active. There is no separate account-level navigation (Security, Notifications, Waiver, Emergency contacts).
- One long, unsectioned column (`maxWidth: 520`; the waiver section is 760): **Emergency contacts → Your details → Password → Membership agreement**. The first-run banner says the two things you need are phone/address and an emergency contact, but the form with phone/address sits *second* and its "Save details" and "All set: continue" buttons are below the password form's neighbour. Required markers: `*` on contact fields always, `*` on details only when `?setup`. **Verified.**
- Feedback: a single `busy` state is shared by three forms, so saving one disables the other two. Status text (`m1`, `m2`) renders below the button with no `aria-live` timing guarantee; contact save errors are `role="alert"`, details success is `role="status"` ("Saved."). **Verified.**
- **Remove contact** has no confirmation and does not check `r.ok`. If the DELETE fails nothing happens and nothing is said. A member can also remove their *only* emergency contact, which the app otherwise treats as mandatory (the banner then reappears). **Verified** (`profile.tsx`, contact Remove handler).
- Email field is `disabled` with no text on how to change it. **Verified.**
- Password form: no `username` hidden field for password managers; error text is the raw API response (`r.text()`), e.g. a bare status string. "At least 10 characters" is in the label only; there is no strength or match feedback. **Verified.**
- Notifications link at the very top (`/notifications`) is a bare paragraph above the form. **Verified.**
- Membership agreement section (`waivers.tsx`): good in content, but status uses ✅/⚠️ emoji as the only status indicator inside `role="status"`, three levels of nested `<details>` ("Revision 3" › "See every change" › "Read the full text"), and "Download my signed PDF" is a link styled `.pri` inside a paragraph. The "newer agreement… You'll be asked to sign it" warning has no direct "Sign now" action. **Verified.**
- Hard-coded colours (`#b00020`, `#fff4d6/#4a3500`, `#e6f4ea/#14532d`, `#ddd` card border) bypass the theme tokens; in dark mode `#ddd` and the yellow banner are not themed. **Verified** (inline styles in `profile.tsx`). *Account has no `.adm .card` usage for contacts, so the same "card" looks different from the cards two pages over.*

---

## Cross-Cutting Problems

1. **Naming is by-section, not by-concept.** See the Terminology Matrix. Tab ≠ menu ≠ `<h1>` ≠ URL in nearly every admin section.
2. **No document `<title>` in admin.** Browser tabs, history and screen-reader page announcements are identical across ~60 pages.
3. **Five confirmation patterns, no undo** (details in X-01/X-02).
4. **"Tabs" implemented four ways:** `aria-pressed` buttons in a `<nav>` (Forms, Chores, Bookings), `.seg` segmented control (Pages), `role="tab"`+`aria-pressed` (Pages), and `.ncat` list buttons (Needs). Only one of them (`.seg`) has a visual style defined for the selected state; the others rely on bold text or the missing `.primary` class. 26 `aria-pressed` and 6 `role="tab"` usages in total.
5. **Buttons in headings** (Postmaster, Signed Docs, Subscribers): inconsistent, and pollute the heading's accessible name.
6. **Status feedback has no component.** ~76 `role="status|alert"` elements, hand-coloured (`var(--bad)`, `#b00020`, `.err`, `.ok`, `.toast`). Success messages appear in different places (above a form, beside a button, at the bottom of a card, a floating toast in Chores) and mostly never clear.
7. **Date/time formatting:** `toLocaleString()`, `toLocaleString([], {dateStyle:"medium",timeStyle:"short"})`, `toLocaleDateString("en-US",{weekday:"short"…})`, `toLocaleDateString()`, relative `3d`, relative `3d ago`, `ago()` vs a local `ago` in `approvals.tsx`. Nine files define their own `when`/`day`/`time`.
8. **Inline styles instead of tokens:** ~750 `style={{` blocks in these three trees; stray hex colours (`#b00020`, `#d97706`, `#fff4d6`, `#4a3500`, `#1b7f3b`, `#e6a100`…) that duplicate `--bad`, `--ok`, `--acc` and do not follow the dark theme.
9. **Contrast and colour-only meaning:** `.sub` (`--mut:#6b7280` on page bg `#f5f6f8`) ≈ 4.5:1 borderline; badge and ribbon white-on-amber/lime ≈ 3:1; urgency in Chores/Approvals/Inbox is colour or emoji alone.
10. **Links are underlined nowhere inside the shell** (`.adm a{text-decoration:none}`); in running text a link differs from body copy only by blue vs near-black (≈3.6:1). 1.4.1 requires more than colour unless 3:1 against surrounding text *and* a hover/focus cue; no hover underline is defined. **Needs validation.**
11. **Nothing guards unsaved edits** except the guided page editor. Email editor, Signed Docs new paper, menu/hours/board editors, post editor, agreement draft, Classes forms.
12. **Full-page reloads** (`location.reload`, `location.assign`, `<a href>` for in-app links like `← Inbox`, `/members/directory` on Home) discard client state and flash the shell.
13. **Developer vocabulary** in admin (see Terminology Matrix) and **ops detail in end-user copy** (IP/UA strings; "Tell the webmaster this code").
14. **Native `confirm()` in one section** and custom dialogs in the rest.
15. **Role boundaries are only as permissive as the menu:** members see "Admin panel" correctly, but admins have no path back to their own member Home or Account (they must edit the URL).

---

## Prioritized Findings Table

Effort: S / M / L · Scope: Local / Cross-page / System-wide.

| ID | Priority | Route / Component | Problem | Recommended Change | Impact | Effort | Confidence |
|---|---|---|---|---|---|---|---|
| A-01 | **P0** | `/admin/mail` `.mp-act` (`mailadmin.css:6-7`) | Row actions are `visibility:hidden` until mouse hover; unreachable by keyboard (WCAG 2.1.1) and invisible to touch >820px | Show always, or reveal on `:hover, :focus-within`; keep visible on coarse pointers | High: blocks all keyboard users from edit/trash/delete in mail | S | Verified |
| X-01 | **P0** | All delete/void/erase flows | Four patterns incl. native `confirm()` for the most destructive mail actions (erase subscribers, delete forever, send to N people) and a *non-danger* "Delete all queued emails" | One `confirmAction({title, consequence, confirmLabel, danger})`; convert all `confirm()`; require `danger` for permanent actions | High: prevents wrong clicks and inconsistent expectations | M | Verified |
| C-03 | **P0** | `/account` Remove emergency contact | No confirmation, no `r.ok` check, and the last required contact can be removed | Disable Remove on the only contact; check response; show failure | Medium-high: safety data silently lost or silently fails | S | Verified |
| A-02 | **P1** | `/admin/landing` | Content-free animated image as the default landing; infinite animation with no reduced-motion guard (WCAG 2.2.2); empty page if SVG missing | Replace with "Needs attention" + recent activity + shortcuts; keep the art as a small header if wanted; wrap animation in `prefers-reduced-motion: no-preference` | High: every admin session starts here | M | Verified |
| A-03 | **P1** | `alerts.tsx` global modal | Full-screen blocking modal on every admin page; per-browser ack; no focus trap or inert background; nested button in anchor | Replace with a persistent inline banner/counters in the top bar linking to queues; keep modal (if at all) to first load per session; fix nesting | High: interrupts all work; affects every admin | M | Verified |
| X-03 | **P1** | Admin naming | Tab, menu, `<h1>`, URL disagree (Admin/People & access/Services; Postmaster/Mail; Forms ×2; Signed Docs/Papers/Buckets; CRM) | Adopt the section-name table below; align tab, menu, heading and `<title>` | High: findability, training, support | M | Verified |
| X-04 | **P1** | Admin `<title>` | No page titles in admin (WCAG 2.4.2) | Add `metadata.title = "Page · Section · Kzoo Makers Admin"` per page | Medium-high | S | Verified |
| X-05 | **P1** | Loading states | No `loading.tsx`; all pages dynamic | Add `admin/loading.tsx`, `members/loading.tsx` with a skeleton/progress bar | Medium-high: nav feels dead | S | Strong inference |
| A-04 | **P1** | `/admin/users` page composition | Approvals queue, signup counter, permissions and API keys stacked on one page | Move approvals to CRM only (link with count); put API keys under Services; keep permission matrix alone | Medium-high | M | Verified |
| A-05 | **P1** | Admin menu: Services | 11 dev/ops pages share a tab with access control; two public-content pages (Privacy, External links) hidden there | Split: "Access" and "System"; move Privacy and External links to Webmaster › Site | Medium-high | M | Verified |
| A-06 | **P1** | Webmaster nav (4-level hover flyout) | Fragile pointer path; deep nesting; icons repeat | Replace with a flat page list + search or a persistent tree; max 2 levels | Medium-high | M | Verified/Needs validation |
| A-07 | **P1** | `/admin/forms` inbox | 4 names for one queue; silent failures; weak selected tab state; no bulk | Rename to "Messages"; add `r.ok` handling; bulk reject/delete spam; collapsible bodies | Medium | M | Verified |
| X-06 | **P1** | Feedback component | ~76 hand-rolled status/alert elements; messages never clear; silent failures (Forms, Account contact) | Shared `<Notice>`/toast with `aria-live`, auto-clear on success, persistent on error | High (cross-page) | M | Verified |
| X-07 | **P1** | Unsaved edits | Only guided editor warns on leave | Shared `useDirtyGuard()`; apply to email editor, new paper, post, menu, hours, board, agreement | High: data loss | M | Verified |
| X-08 | **P1** | Button/class system | `pri`, `primary`, `btn btn-main`, `bad`, `danger`, inline red; `.primary`/`.bad` have no rule in admin CSS | Define `Button` (primary/secondary/danger/ghost); delete dead class names | High: visual consistency; fixes unstyled buttons | M | Verified / Needs validation |
| M-01 | **P1** | `/members` Home | Passive read-only lists; heading "Members area" vs nav "Home"; no actions, no unread/next-up signal | Task cards: next class, expiring authorizations, unread messages, hours this month; real CTAs | High: most-visited member page | M | Verified |
| M-02 | **P1** | Directory bio + cards | Click-only `<p>` toggle (not keyboard accessible); send confirmation far from the form | Real `<button aria-expanded>` for "Read more"; show result inline in the card | Medium-high | S | Verified |
| M-03 | **P1** | Inbox read-marking on render | GET render has a write side effect; prefetch/refresh consumes unread state | Mark read client-side after view, or per-conversation on open | Medium-high | S | Verified |
| C-01 | **P1** | `/account` structure | One long column; first-run order contradicts banner; no sectioning | Sectioned page with anchor nav or tabs: Details · Emergency contacts · Sign-in · Notifications · Agreement; first-run as a 2-step checklist | High: every member, mandatory flow | M | Verified |
| C-02 | **P1** | `/account` forms feedback | Shared `busy` across forms; ambiguous status; raw API text as errors | Per-form state; field-level validation; plain-language errors | Medium-high | S | Verified |
| X-09 | **P1** | Nav a11y (menus) | `role="menu"` without menu behaviour (user menu, envelope); `role="tab"`+`aria-pressed`; flyout button semantics | Use disclosure pattern (button + `aria-expanded` + list) or implement full menu keys; use `aria-selected` for tabs or drop the role | Medium-high | M | Verified |
| A-08 | **P2** | Permissions matrix | 9 selects per row; no presets, bulk, undo | Role presets + "copy from"; per-row save with toast + undo | Medium | M | Verified |
| A-09 | **P2** | Signed Docs "New paper" | One long form; advanced options at same level; success page dead-ends | Stepper (Document → People → Fields → Review); collapse advanced; open the created paper | Medium | L | Verified |
| A-10 | **P2** | Tours bookings | IP/UA/screen shown by default; "Cancel / Cancel tour" ambiguity; `en-US` hard-coded | Hide device info in a "Technical details" disclosure (or drop); dialog button "Cancel this tour"; shared date helper | Medium | S | Verified |
| A-11 | **P2** | Postmaster | Buttons in headings; `location.reload()`; Forms name clash; Settings jargon beside daily tasks | Page-header component with actions slot; refresh state in place; rename to "Signup forms"; move Settings last/under a gear | Medium | M | Verified |
| A-12 | **P2** | CRM nav | Daily queue, reference lists and legal doc are peers | Group: *People* (People, New members), *Programs* (Classes, Tools), *Setup* (Skills, Profile values, Agreement) | Medium | M | Verified |
| A-13 | **P2** | Person page | Flat 14-field form; password shown in plain text and relayed manually; contacts read-only | Section the form; password reset link only (remove manual set or mask+generate+copy); allow admin contact edits | Medium | M | Verified |
| A-14 | **P2** | Admin ↔ member navigation | No link from admin to own Members/Account | Add "My member area" and "My account" to admin user menu | Medium | S | Verified |
| A-15 | **P2** | Chores admin vs member naming | To do/Hours log/Stats/Achievements vs To do/Hours/Achievements/Standouts; "Put away" vs "Delete" | Pick one set | Low-medium | S | Verified |
| M-04 | **P2** | Phone notifications ×5 labels | "Phone alerts", "Phone notifications", "ntfy", "Notifications" (bell), "Notifications" (tours) | Name: *Phone alerts* (member), *Alert delivery (ntfy)* (admin), *Activity* (bell) | Medium | S | Verified |
| M-05 | **P2** | Profile autosave | Retries only "on next change"; one status line at page bottom; many near-duplicate toggles | Save indicator pinned to the section; per-field error; explicit "Retry" | Medium | M | Verified |
| M-06 | **P2** | Chores (member) | Embedded CSS, hard-coded 4 h goal, emoji urgency, "friend" fallback | Move to tokens; make goal configurable and explain it; add text for urgency | Medium | M | Verified |
| M-07 | **P2** | Members top bar | One tab "Members" | Remove tab or turn into area switcher (Members ↔ Account ↔ Admin) | Low-medium | S | Verified |
| C-04 | **P2** | Account agreement | Emoji status; 3 nested `<details>`; no "Sign now" | Status badge with text; flatten; add primary action when a new revision exists | Medium | S | Verified |
| X-10 | **P2** | Date/time formats | Seven formats; nine local helpers | One `format.ts` (`date`, `dateTime`, `relative`) | Medium | S | Verified |
| X-11 | **P2** | Page header | `<h1>` styles, `.sub` copy, action buttons placed ad hoc | `PageHeader({title, description, actions, back})` | Medium | M | Verified |
| X-12 | **P2** | Empty states | "Nothing here.", "No one found." | Add the next step ("No held messages. New ones appear here when the spam filter catches them.") | Low-medium | S | Verified |
| X-13 | **P2** | Dialog theming | `dialog.dlg` hard-codes light colours; `aria-label` = full paragraph | Use tokens; `aria-labelledby` title + `aria-describedby` body; add title line | Medium | S | Verified |
| X-14 | **P2** | Jargon in microcopy | slug, robots.txt, SMTP2GO, ADMIN_EMAILS, CHORES_API_KEY, IP/UA | See matrix | Medium | S | Verified |
| X-15 | **P3** | Contrast | Badge and ribbon ≈3.2:1; `.sub` on page bg ≈4.5 | Darken amber/lime; use `--mut` darker or place on white | Low-medium | S | Verified (computed) |
| X-16 | **P3** | Links without underline | `.adm a{text-decoration:none}` | Underline links in running text, or add hover underline | Low | S | Needs validation |
| X-17 | **P3** | Emoji icons repeated | Meaning collisions | Single icon set (inline SVG) | Low | M | Verified |
| X-18 | **P3** | Switch-styled checkboxes in tables | Same push switch for selection/"required" as for settings | Keep native-looking checkbox for row selection | Low | S | Strong inference |
| X-19 | **P3** | Full-page navigations | `location.assign`/`<a>` for in-app links | `Link`/`router.push` | Low | S | Verified |
| X-20 | **P3** | Corner ribbon + 8-px frame + bevels | Decorative layers cost space and contrast | Drop ribbon; keep frame optional | Low | S | Verified |

---

## Detailed Recommendations

### A-01: Keyboard-unreachable row actions (Postmaster)
- **Location:** `/admin/mail/{emails,subscribers,forms,lists}` · `web/app/admin/mail/mailadmin.css:6-7,16` · classes `.mp-act` (used in four `.tsx` files)
- **Current behavior:** `.mp-act{visibility:hidden}`; `.mp-table tr:hover .mp-act{visibility:visible}`. Only `@media (max-width:820px)` forces them visible.
- **Problem:** Hidden controls are removed from the tab order and no `:focus-within` rule reveals them; touch devices wider than 820 px (tablets, landscape phones) never see them.
- **User impact:** Keyboard and switch users cannot edit, trash, restore or delete anything in the mail section; tablet users cannot find actions.
- **Recommendation:** Replace `visibility:hidden` with `opacity:.0` + `:focus-within` and `@media (hover:none)` overrides, or always show at reduced emphasis.
- **Example:**
  ```css
  .mp-act{opacity:.55}
  .mp-table tr:hover .mp-act,.mp-table tr:focus-within .mp-act{opacity:1}
  ```
- **Priority / effort:** P0 · S
- **Evidence:** CSS read directly · **Verified**

### X-01 / X-02: One destructive-action pattern, and undo where it is cheap
- **Location:** 48 `confirmDialog` call sites; 7 native `confirm()` calls in `admin/mail/*`; `web/components/dialog.tsx`; `admin/disable-button.tsx`
- **Current behavior:** (1) custom dialog + `danger:true` (34 uses), (2) custom dialog without `danger` (e.g. Queue "Delete all", financial PDF delete, Revert), (3) native `confirm`, (4) no confirmation (Account contact removal). Delete buttons: `className="danger"` (28; red only on hover), inline `color:var(--bad)` (34; red at rest), `className="bad"` (Postmaster), or plain. Dialog "Cancel" is always present, so "Cancel tour" yields *Cancel | Cancel tour*. Removing an unsaved row from an editor (menu, board, photos) also asks for confirmation although "don't save" already undoes it.
- **Problem:** Users cannot learn what a red button means or what will happen. Over-confirmation trains click-through; under-confirmation (native confirm for erase) is worse than none because it looks routine.
- **User impact:** All admins; highest cost on Postmaster sends/erasures and CRM person deletion.
- **Recommendation:**
  1. One `<DestructiveButton>` (red at rest, `aria-describedby` to consequence) and one `confirmAction` API: `{ title, consequence, confirmLabel, danger, typeToConfirm? }`.
  2. Tiering: *Reversible/unsaved edit* → no dialog (use "Undo" toast); *Recoverable* (trash, void, disable) → toast with Undo for 8 s; *Irreversible* (erase subscriber, delete person, send to N, publish agreement revision) → dialog; for bulk/erase require typing the count or name.
  3. Dialog buttons named for the action ("Keep tour" / "Cancel tour"); title line separate from body; tokens for dark mode; `aria-labelledby`/`aria-describedby` instead of putting the paragraph in `aria-label`.
- **Example:** *Send now* → title "Send to 1,284 people?" body "This goes out immediately and can't be recalled." buttons "Not yet" / "Send to 1,284".
- **Priority / effort:** P0 (mail) then P1 (rest) · M · System-wide
- **Evidence:** grep counts, `dialog.tsx`, `mail-admin.tsx:87,151`, `subscribers.tsx:34,36`, `emails.tsx:36,121,175`, `forms.tsx:63` · **Verified**

### C-03: Emergency-contact removal
- **Location:** `/account` · `account/profile.tsx` (Remove button handler)
- **Current behavior:** `onClick → send("DELETE", …?contact=id)`; `if (r.ok) setContacts(await r.json())`. No confirm, no else branch. Any contact, including the only one, can be removed.
- **Problem:** Failure is silent; success leaves the member in a state the app calls invalid (banner "Please add an emergency contact" returns). This is safety data.
- **Recommendation:** Disable Remove when `contacts.length === 1` with helper text "Add another contact before removing this one"; handle `!r.ok` with a visible `role="alert"`; no confirm needed once removal is guarded and undo is offered.
- **Priority / effort:** P0 · S · **Verified**

### A-02: Replace the landing illustration with a working home
- **Location:** `/admin/landing` (`landing/page.tsx`, `landing.css`); `/admin/page.tsx`
- **Current behavior:** Dark SVG "brain" with infinite CSS animation, no text; `/admin` → `/admin/landing`.
- **Problem:** First screen has zero information scent; people must already know which tab to use; the only prompt is the blocking modal. Animation runs indefinitely with no motion preference (2.2.2). Missing SVG = blank page.
- **Recommendation:** Landing = permission-filtered cards: **Needs attention** (new members, reviews, comments, held messages, tours today), **Recent activity** (last 5 audit lines), **Quick links** (New post, New email, New paper, Tours this week). Keep the artwork as a header at ≤120 px or behind `@media (prefers-reduced-motion:no-preference)`.
- **Example:** `Needs attention · 3 new members · 2 reviews · 1 held message`, each a link straight to the filtered queue.
- **Priority / effort:** P1 · M · **Verified**

### A-03: Demote the global alerts modal
- **Location:** `admin/alerts.tsx`, mounted in `admin/layout.tsx`
- **Current behavior:** Polls every 60 s; if any pending type exceeds the browser's stored max id, shows `role="alertdialog"`, steals focus, and covers the page. "Review now" is `<a><button/></a>`. Acknowledgement is per browser.
- **Problem:** Interrupts editing (possible data loss alongside X-07), re-triggers during the same session, shows again for every admin and device, and nests interactive elements. `aria-modal` without a focus trap or `inert` lets Tab escape to the page behind.
- **Recommendation:** Persistent count badges next to the relevant top-bar tabs/menu items (CRM ●3, Forms ●1), plus the landing card. If a modal stays, show it once per session on landing only, and fix markup (`<a className="btn pri">`).
- **Priority / effort:** P1 · M · **Verified**

### X-03: One name per concept (navigation and headings)
- **Location:** `admin/tabs.ts`, `admin/nav.tsx`, every `<h1>`, route folders
- **Current behavior:** See matrix. Examples: tab "Admin" → item "People & access" → also tab-highlights `/admin/services`; tab "Postmaster" ↔ route `/admin/mail`; two things named Forms; `Papers/Signed docs/Buckets`.
- **Recommendation:** Single source of truth: extend `TABS`/`MENUS` into `{ key, tab, menu, title, path }` and generate tab, menu item, `<h1>` and `<title>` from it. Proposed top-level names: **Website** (was Webmaster), **Email** (Postmaster), **Blog**, **Messages** (top-level Forms), **People** (CRM + access), **Signatures** (Signed Docs), **Tours**, **Chores**, **System** (Admin/Services). If internal names are kept for muscle memory, keep the old label in a subtitle for one release.
- **Priority / effort:** P1 · M · System-wide · **Verified**

### X-04: Page titles
- **Location:** every `admin/**/page.tsx`
- **Current behavior:** No `metadata` export under `admin/`. (`members/*` and `account` set titles.)
- **Recommendation:** `export const metadata = { title: "Tour bookings · Tours · Admin" }` or use the generated title from X-03. Dynamic pages (`crm/people/[id]`, `blog/[id]`) use `generateMetadata`.
- **Priority / effort:** P1 · S · **Verified** (WCAG 2.4.2)

### X-05: Navigation feedback
- **Recommendation:** `app/admin/loading.tsx` and `app/members/loading.tsx` rendering the page shell skeleton; add a thin top progress bar in the shared layout. Replace the 22 hand-written "Loading…" strings with a `<Skeleton>`.
- **Priority / effort:** P1 · S · **Strong inference** (depends on Next.js prefetch/streaming behaviour for dynamic routes).

### A-04 / A-05: Recompose People, Access and System
- **Current:** `/admin/users` = signup counter + approvals + permission matrix + API keys; `/admin/services` menu = 11 items of mixed audience.
- **Recommendation:**
  - *People* (tab): People · New members (with count) · Access (permission matrix) · Classes · …
  - *System* (tab): Setup · Audit log · Notifications delivery · API keys · AI · Diagnostics (Debug, HTTP log, Postgres stats, Security headers) — diagnostics collapsed under one "Diagnostics" item.
  - Move *Privacy statement* and *External links* into Website.
  - The signup rate counter becomes a line item in System › Setup (or surfaces only when ≥80% of limit).
- **Priority / effort:** P1 · M · **Verified**

### A-06: Flatten the Webmaster menu
- **Current:** Pages › Custom / Guided › {Homepage, Calendar, Board, Learn More › {8}, Handbook, Reach Out › {2}, Other makerspaces, Explore Us › {6}}; Site Config; Reviews.
- **Recommendation:** Single "Pages" screen with search and a grouped list (the existing `pages.tsx` tree already does this), badge each page "Guided" or "Custom"; sidebar shows only: Pages · Calendar · Board · Financials · Hours & address · Menu · Reviews · Advanced. Remove hover flyouts on desktop; keep the disclosure pattern used on phones.
- **Priority / effort:** P1 · M · **Verified** (structure) / **Needs validation** (hover reliability)

### A-07: Forms inbox → Messages
- **Recommendation:** Rename tab "Spam / held" → "Held"; section "Messages"; bulk select + "Reject selected / Delete selected"; collapse long bodies after 3 lines; check `r.ok` in `load`/`del`; make selected tab state `aria-current`/weight + underline; secondary-style Delete.
- **Example empty state:** "No held messages. Anything the spam filter catches will wait here for you."
- **Priority / effort:** P1 · M · **Verified**

### X-06: Shared notice / toast
- **Recommendation:** `<Notice kind="success|error|info">` and `useToast()`; success auto-dismisses after ~5 s, errors persist until dismissed or next submit; live region `aria-live="polite"` (errors `assertive`); consistent position (top of the form for validation, bottom-left toast for async completion). Convert Forms, Account, Tours, Chores, Signed Docs first.
- **Priority / effort:** P1 · M · **Verified**

### X-07: Dirty-state guard
- **Recommendation:** Extract the guided editor's `beforeunload` logic into `useDirtyGuard(dirty)`, plus an in-app route-change confirm via the shared dialog; apply to email editor, post editor, new paper, menu/hours/board/agreement editors, Classes proposals. Show "Unsaved changes" in the `.savebar` (already styled) rather than only on leave.
- **Priority / effort:** P1 · M · **Verified** (only one `beforeunload` in the tree)

### X-08: Buttons and dead class names
- **Recommendation:** Single `Button`/classes: `btn` (secondary), `btn-primary`, `btn-danger`, `btn-ghost`, sizes `sm`. Replace `pri`, `primary`, `btn-main`, `bad`, `danger`, inline red. Verify whether the site's global CSS defines `.btn`, `.btn-main`, `.primary` and `.bad`; if not, today's members/account buttons and Chores/API-key primary buttons are styled only by the generic `.adm button` rule.
- **Priority / effort:** P1 · M · **Verified** (usage counts: `pri` 67, `danger` 28, `btn btn-sm` 14, `primary` 8, `btn btn-main` 6+3) / **Needs validation** (global CSS)

### M-01: Make Members Home useful
- **Current:** Three static lists and a footer link line.
- **Recommendation:** Top row of cards: **Next class** (with link), **Authorizations** (expiring/expired first with "How to renew"), **Messages** (n unread), **Volunteer hours** (this month). Below: "Find a member", "Edit profile". Retitle `<h1>` to match nav ("Home") or retitle nav to "Overview".
- **Example copy:** "Your Laser Cutter sign-off expired Oct 3. Book a refresher →".
- **Priority / effort:** P1 · M

### M-02 / M-03: Directory and Inbox
- **M-02:** Replace `<p onClick>` with `<button aria-expanded>` "Read more / Show less". Render the send confirmation within the card (replace the form with "Sent. Replies appear in your Inbox. [Undo not possible]"). Keep the placeholder text as help text under the field.
- **M-03:** Remove `markRead` from the server render. Mark individual notices read on click (the envelope already does) and a "Mark all read" button on the page. Provide text labels ("New") beside the dot.
- **Priority / effort:** P1 · S each · **Verified**

### C-01 / C-02: Rework `/account`
- **Recommendation:** Anchored sections with a short in-page nav (or tabs): **Details**, **Emergency contacts**, **Sign-in & security**, **Phone alerts**, **Membership agreement**. First-run state: a 3-item checklist at the top ("Phone & address ✓ · Emergency contact ○ · Continue"), with the primary "Continue" button disabled until complete. Per-form busy and status; field-level messages for password ("At least 10 characters, 3 more to go"). Explain the email field ("To change your email, contact the board."). Add a hidden `username` input for password managers. Replace raw `r.text()` with mapped messages.
- **Priority / effort:** P1 · M · **Verified**

### X-09: Menu / tab semantics
- **Recommendation:** Where it is a menu of links (user menu, envelope panel) use the disclosure pattern: button with `aria-expanded`/`aria-controls`, list of links, Escape closes and returns focus; drop `role="menu"/"menuitem"`. For tab-like filters use `aria-pressed` buttons *without* `role="tab"`, or implement `tablist` fully.
- **Priority / effort:** P1 · M · **Verified**

### A-08: Permission matrix
- **Recommendation:** Add role presets (Webmaster, Postmaster, Treasurer, Front desk, Full admin) that fill the nine selects, an "applied" toast with Undo, and a narrow view on phones (one person at a time).
- **Priority / effort:** P2 · M

### A-09: New paper stepper
- **Recommendation:** Four steps (Document → People → Fields → Send) with a summary rail; hide "sign in order", quorum, passwords, redirect, hide-audit under "Advanced". On success open the created paper. Capitalise field-type buttons ("Signature", "Initials").
- **Priority / effort:** P2 · L

### A-10: Tours bookings
- **Recommendation:** Remove IP/user-agent/screen from the card (move into a "Technical details" disclosure for admins who need to investigate spam); dialog buttons "Keep booking" / "Cancel tour"; replace `<nav>` wrapper on the "Include past tours" control with a plain toolbar; shared date helpers.
- **Priority / effort:** P2 · S

### A-11 / A-12 / A-13 / A-14 / A-15
- **A-11:** `PageHeader` with actions slot; stop putting buttons inside `<h1>`; replace `location.reload()` with state updates; rename Postmaster › Forms → "Signup forms"; move Settings to the end with a gear icon.
- **A-12:** Regroup CRM menu under three subheadings: *People*, *Programs*, *Setup*.
- **A-13:** In the Person page: section the form (Contact · Address · Membership IDs · Notes), move account actions to a sticky "Account" card, mask the manual password and offer "Generate & copy" or remove it in favour of the reset email; let admins edit emergency contacts.
- **A-14:** Add "My member area" and "My account" to the admin user menu, so overlapping roles can switch without URL editing.
- **A-15:** Align admin and member chores names (To do · Hours · Achievements · Standouts → "Top contributors") and use one verb for removal.

### M-04: Notifications naming
- See matrix. Rename nav "Phone alerts" ↔ page title "Phone alerts"; Account/user-menu links use the same; admin "Notifications (ntfy)" → "Alert delivery"; tours "Notifications" → "Tour email & alerts"; bell stays "Notifications" but its "See all" opens "Activity".

### M-05 / M-06 / M-07 / C-04
- **M-05:** Show inline saved state next to each section heading; on failure show "Couldn't save *Skills*. Retry" with a button; fold the three "List my … in the directory" toggles into one "What others can see" group with a preview.
- **M-06:** Move Chores CSS into the shared stylesheet using tokens; make the monthly goal a setting and explain it ("Members are asked for 4 hours a month"); add a text label to urgency ("Late 3 days").
- **M-07:** Replace the single "Members" tab with an area switcher or remove it.
- **C-04:** Replace ✅/⚠️ with a text badge ("Up to date" / "New revision to sign"); add a primary "Review and sign" button when `!v.current`; keep one level of `<details>`.

### X-10 – X-20 (system-wide polish)
- **X-10:** `lib/format.ts` with `fmtDate`, `fmtDateTime`, `fmtRelative`; delete the nine local helpers. Pick one locale policy (browser locale, medium style) and state timezone where relevant (tours).
- **X-11:** `PageHeader({ title, description, actions, back })`.
- **X-12:** Empty-state component with next step.
- **X-13:** Dialog tokens and accessible naming (see X-01).
- **X-14:** Replace jargon per matrix.
- **X-15:** Use `#b45309` (≈5:1 on white) for amber badges/ribbons, `#4d7c0f` for lime; check `.sub` colour against `--bg`.
- **X-16:** `.adm main a:not(.adm-link):not(.btn){text-decoration:underline}` or underline on hover/focus.
- **X-17:** Replace emoji nav icons with a single inline-SVG set.
- **X-18:** Keep the push-switch only for on/off settings; row selection uses a standard checkbox.
- **X-19:** Replace `location.assign`, `<a href="/members/…">` in-app links with `Link`.
- **X-20:** Remove the ribbon; keep the frame behind a user preference or drop it.

---

## Terminology Standardization Matrix

| Concept | Current Labels | Recommended Label | Locations to Update | Rationale |
|---|---|---|---|---|
| Admin area: access | Tab "Admin"; menu "People & access"; `<h1>` "People & access"; route `/admin/users` | **Access** (under People) | `tabs.ts`, `nav.tsx`, `users/users.tsx` | One word per concept |
| Operator tools | "Services", "Setup", `/admin/services`, "Debug", "HTTP log", "Postgres stats" | **System** with items *Setup, Audit log, Diagnostics* | `nav.tsx`, `services/*` | Audience is operators, not volunteers |
| Email section | Tab "Postmaster"; route `/admin/mail`; menu "Home"; `<h1>` "Home" | **Email** | `tabs.ts`, `nav.tsx`, `mail-admin.tsx:49` | Plain English; "Home" is not descriptive |
| Newsletter signup forms | "Forms" (Postmaster) | **Signup forms** | `mail/forms.tsx`, `nav.tsx` | Removes clash with Messages |
| Contact-form queue | Tab "Forms"; menu "Inbox"; `<h1>` "Forms"; "Spam / held"; "Held"; "held by the spam filter" | **Messages**; status **Held** | `tabs.ts`, `nav.tsx`, `forms/inbox.tsx`, `alerts.tsx` | One name for one queue |
| Signed documents | Tab "Signed Docs"; "Papers"; "New paper"; "Buckets"; "document" in errors | **Signatures** → *Documents*, *New document*, *Templates*, *Folders* | `tabs.ts`, `nav.tsx`, `signed-docs/*` | "Paper" and "bucket" are not user words |
| Website editing | Tab "Webmaster"; "Pages › Custom / Guided"; "Site Config" | **Website** → *Pages* (badge "Guided"/"Custom"), *Site settings* | `tabs.ts`, `nav.tsx`, `webmaster/*` | Describes the job, not the role |
| robots.txt | "robots.txt" (menu + heading) | **Search engine settings** (keep "robots.txt" as a subtitle) | `nav.tsx`, `robots/editor.tsx` | Jargon |
| URL path | "slug", "Bad slug: x" | **Web address** ("Use letters, numbers and dashes.") | `webmaster/pages.tsx`, `signed-docs/*` | Plain language |
| New-member approval | "New members" (menu/h1), "Needs us / Waiting for reply" (tabs), "Pending/Waiting" (internal), "awaiting approval", "Application status" (member) | **Applications**: tabs *To review*, *Waiting for applicant*, *Declined*, *Approved* | `crm/approvals/approvals.tsx`, `alerts.tsx`, `users/page.tsx`, `members/page.tsx`, `pending/status` | Consistent across admin and member |
| Legal document | "Membership agreement", "Membership agreement & liability waiver", `/waiver` | **Membership agreement** (mention "includes liability waiver" once in body) | `crm/waiver/*`, `account/waivers.tsx`, `nav.tsx` | One name |
| Reference lists | "Profile values", "Tools & authorizations", "Skills" | **Skills**, **Profile options**, **Tools & sign-offs** | `crm/*`, `nav.tsx` | "Values" is a data-model word; members see "sign-offs" in prose already |
| Tool permission | "authorization", "sign-off" (member copy: "Tool sign-offs happen…") | **Tool sign-off** (members) / **Authorization** only in admin logs | `members/page.tsx`, `crm/tools/*` | Match the words members hear at the space |
| Phone alerts | "Phone alerts", "Phone notifications", "Notifications (ntfy)", "Set up phone notifications" | **Phone alerts** (member) · **Alert delivery** (admin, with "ntfy" in the description) | `members/chrome.tsx`, `members/notifications/page.tsx`, `user-menu.tsx`, `account/page.tsx`, `services/ntfy` | Name the benefit, hide the tool |
| In-app activity | "Notifications" (bell), "Inbox", "See all" | Bell **Activity**; page **Inbox** | `members/envelope.tsx`, `members/inbox/page.tsx` | Removes the 5-way "Notifications" collision |
| Member home | Nav "Home"; `<h1>` "Members area"; top tab "Members" | **Home** (`<h1>` "Home") | `members/page.tsx`, `chrome.tsx` | Matches wayfinding |
| Directory | Nav "Directory"; `<h1>` "Member directory" | **Member directory** everywhere | `members/chrome.tsx` | Matches heading |
| Profile | Nav "My Profile"; h1 "My Profile"; Home link "Edit your profile and skills"; Account "Your account" | **My profile** (member-facing listing) vs **My account** (private details) | nav, headings, account | Distinguish public vs private |
| Chores | Admin "To do/Hours log/Stats/Achievements"; member "To do/Hours/Achievements/Standouts"; "Volunteer chores" title vs "Chores" nav | **Volunteer chores**: *To do, Hours, Achievements, Top helpers* | `admin/chores/*`, `members/chores/*`, `nav.tsx` | Same data, same words |
| Delete | "Delete", "Remove", "Put away", "Void", "Dismiss", "Erase", "Trash" | **Delete** (permanent), **Remove** (take out of a list), **Archive/Trash** (recoverable), keep *Void*/*Dismiss* only where domain-specific and explain in the dialog | all confirm sites | Predictable consequence |
| Cancel confirm | Dialog "Cancel | Cancel tour" | **Keep tour | Cancel tour** | `dialog.tsx`, `tours/bookings.tsx` | Removes double-cancel |
| Dates | numeric, `3d`, `3d ago`, `Mar 3, 2026`, `Monday, March 3, 2026` | `Mar 3, 2026` · `Mar 3, 2026, 2:15 PM` · relative `3 days ago` | all | One format |
| Recoverable errors | "Network error. Try again.", raw `r.text()`, "This page hit a problem … tell the webmaster this code" | "Couldn't save. Check your connection and try again." plus a reference code with a Copy button | all | Actionable errors |

**Before / after microcopy**

| Before | After |
|---|---|
| "Bad slug: foo bar" | "Web addresses can only use letters, numbers and dashes." |
| "Google logins listed in ADMIN_EMAILS are always full administrators and don't appear here." | "Some administrators are set up outside this list and always have full access." (details in Help / System) |
| "Paste it into YAMNet's Settings › System as `CHORES_API_KEY`…" | "Give this key to the system that logs chores. It's shown once." (setup steps in a collapsible "How to use this key") |
| "Take back the offer to Sam? Their emailed links stop working and the request returns to the queue." | Fine. Keep. Button "Take back offer" |
| "Delete this message for good?" | "Delete this message permanently? You won't be able to get it back." / **Delete message** |
| "No one found." | "No people match 'jim'. Try a name, email or phone number." |
| "Nothing here." (Forms) | "No held messages. Anything the spam filter catches will wait here." |
| "Will retry on your next change" | "Couldn't save. [Try again]" |
| "You're not in the directory." | "You're not listed yet. Turn on your listing to appear here and message other members." [Go to My profile] |
| Alert modal "Needs your attention" | (inline) "3 to review" on the People tab |
| "Final step: subject, recipients and sending" | "Review and send" |

---

## Component Standardization Opportunities

1. **`PageHeader`**: title, optional description, actions slot, back link, optional status. Replaces buttons-inside-`<h1>`, `.sub` improvisation, and the "← People" patterns.
2. **`Button` set**: primary / secondary / danger / ghost / icon; sizes; busy state with spinner. Replaces `pri`, `primary`, `btn btn-main`, `bad`, inline red.
3. **`ConfirmAction` + `UndoToast`**: tiered by consequence (X-01/X-02).
4. **`Notice` / `useToast`**: status and error feedback (X-06).
5. **`Tabs` and `Segmented`**: one accessible implementation with `aria-selected` and keyboard arrows, plus a filter-chip variant that uses `aria-pressed`.
6. **`DataTable`**: sticky header, row actions visible on focus, optional bulk select, empty state, responsive stacking (used by Users, Subscribers, Emails, Forms, Pgstats, Tours stats).
7. **`ListRow` / `RecordCard`**: the `.row` + `.tag` pattern repeated in Approvals, Forms, Bookings, People, API keys, Inbox.
8. **`FormField`**: label, help, error, required marker, `aria-describedby`; kills the `label`/`gfield`/`field`/`mp-f` variants and the inconsistent `*` convention.
9. **`SettingToggle`**: for on/off preferences only (profile, notifications); checkboxes remain checkboxes for lists.
10. **`format.ts`**: date/time/relative.
11. **`StatusBadge`**: text + colour + optional icon (Disabled, Held, Expired, Overdue, Late, Needs review), replacing colour-only and emoji-only states.
12. **`EmptyState`**: icon optional, one sentence, one next action.
13. **`Disclosure`**: used for user menu, envelope, nav groups and `<details>` sections, with correct headings.
14. **Design tokens**: promote `--ok --bad --warn --info` and surface colours to cover the hard-coded hex values; ban inline `color:#...` via lint.
15. **`useDirtyGuard`**, **`useAutosave`**: shared behaviour for editors and the Profile page.

---

## Workflow Simplification Opportunities

Interaction counts are estimates counted from the code paths (clicks and typed fields); they are not measured times.

| # | Journey | Current path | Friction | Recommended | Est. saving |
|---|---|---|---|---|---|
| 1 | **Admin approves a new member** | Sign in → `/admin/landing` (no info) → "CRM" tab → "New members" → open row → Approve (≈5 clicks, and only if the modal didn't intercept first). Also reachable on `/admin/users`. | Landing gives no cue; approvals live in two places; modal competes | Landing "3 new members" card → queue → Approve; approvals in CRM only | ≈2 clicks, and removes discovery cost |
| 2 | **Admin handles held contact messages** | Modal → "Review now" (or Forms tab) → "Spam / held" tab → per message Approve/Reject/Delete → each action reloads list | No bulk; destructive button peer to primary | Badge on tab → default to Held → bulk select → "Reject selected" | N clicks → 2 for a batch of N |
| 3 | **Grant someone access** | People & access → search → find row → set up to 9 selects one by one | No presets or bulk | Preset role picker + undo toast | 1 select vs up to 9 |
| 4 | **Send a newsletter** | Email › Emails › New email › Pick template › Editor › Final step › `confirm()` | Native confirm; "Final step" name; reload after delete | Keep stepper, name steps "Template · Write · Review & send"; real dialog with recipient count | Fewer errors; same clicks |
| 5 | **Edit a website page** | Webmaster › Pages › (Custom list) → click page → leaves admin to `/edit/slug` | Different chrome; no breadcrumb back | "Edit" opens in same chrome with "← Pages" link; or open in new tab with explicit notice | 1 orientation step |
| 6 | **Create a signature request** | Signed Docs › New paper → one long form with ~20 inputs → Create | No progressive disclosure; dead-end success | Stepper; advanced collapsed; open created paper | Reduces first-time decisions from ~20 to ~6 |
| 7 | **Member finds and messages a member** | Directory → search/filter → "Message Sam" → type → Send → confirmation at top of page | Confirmation off-screen; no link to the conversation | Inline "Sent" in the card with "View conversation" | Removes scroll-and-search for confirmation |
| 8 | **Member sets up phone alerts** | Reaches `/notifications` from Account top link, user menu or `/members/notifications` | 3 entry points, 5 names | One entry "Phone alerts" in nav + Account section | Removes ambiguity |
| 9 | **New member first-run** | Approval → `/members/onboarding` → redirected to `/account?setup=1` → scroll: contacts → details (Save) → "All set: continue" → agreement → handbook → ID | Order of forms differs from banner; "continue" hidden below; two UIs | Single checklist wizard: Details → Contact → Agreement → Handbook → ID, progress indicator | Fewer wrong turns; one mental model |
| 10 | **Admin disables an account** | Person → "Disable account" → prompt dialog with a three-sentence label → type reason or blank → OK | The dialog's `aria-label` is the entire paragraph; blank has a hidden default | Dialog with title "Disable Sam's account", labelled "Message shown at sign-in" field prefilled with default | Clearer, same clicks |
| 11 | **Admin switches to own member view** | Edit URL manually | No link | "My member area" in user menu | 1 click vs URL edit |
| 12 | **Mail: edit a list/subscriber with keyboard** | Impossible (A-01) | — | Visible actions | Unblocks |

---

## Quick Wins

1. A-01: show `.mp-act` on `:focus-within` / always. (**P0**, minutes.)
2. C-03: guard and error-handle emergency-contact removal. (**P0**.)
3. Add `danger: true` to the Queue "Delete all" and Financials PDF delete confirms; convert `confirm()` calls to `confirmDialog`.
4. Add `export const metadata` titles in admin pages (script-generate from the section table).
5. Add `loading.tsx` to `admin/` and `members/`.
6. Wrap `landing.css` animations in `@media (prefers-reduced-motion:no-preference)`.
7. Fix `Review now` markup (`<a>` styled as a button instead of `<a><button/></a>`).
8. Replace Directory bio `<p onClick>` with a button.
9. Stop marking Inbox notices read during server render.
10. Hide client IP / user-agent behind a disclosure in Tour bookings.
11. Rename `Bad slug` and the other jargon strings in the matrix.
12. Add "My member area / My account" to the admin user menu.
13. Dialog buttons: "Keep tour | Cancel tour".
14. Add an explanatory line to Account's disabled email field.
15. Replace `href="#"` fallback in Inbox with plain text.
16. Add the missing `role="alert"`/error branch to Forms `load`/`del`.
17. Darken badge/ribbon colours for AA.
18. Use `Link` for in-app anchors (`← Inbox`, Home links).

---

## Larger Architectural Improvements

1. **Navigation regeneration from a single schema** (name, path, permission, icon, badge count, parent) driving tabs, left menu, breadcrumbs, `<title>`, landing cards and the Users matrix columns. Prevents the drift seen today.
2. **Admin home as a work queue** with permission-aware counts, replacing the global modal.
3. **Split "Admin" into People/Access and System**, and move public content (privacy, links) into Website.
4. **A unified People model in the UI:** one people list that shows application state, access, member state and disabled status, with filtered views ("Needs approval", "Staff", "Disabled"), instead of CRM People + People & access + the approval queue.
5. **Inbox unification:** merge the member bell, Inbox, and phone-alert settings into one "Activity & alerts" area; do the same for admin (bell counts + queues).
6. **Account as a first-class area** with its own nav (Details, Contacts, Security, Alerts, Agreement) available from both admin and members chrome, and a guided first-run checklist reusing the same sections.
7. **Form infrastructure:** `FormField`, validation, autosave/dirty guard, shared notice, and optimistic update with undo; remove hand-written `fetch` + `setMsg` blocks.
8. **Design-token and component library** extracted from `webmaster.css`, `mailadmin.css`, `classes.css`, `directory.css`, `profile.css`, and the embedded Chores `<style>`, so that members and admin share primitives while keeping distinct layouts (e.g. gamified Chores can stay expressive but on tokens).
9. **Responsive tables strategy:** `display:block; overflow-x:auto` on all tables on phones; for Users matrix and Subscribers use a card-per-row layout.

---

## Recommended Implementation Roadmap

### 1. Immediate usability fixes (days)
A-01, C-03, quick wins 3–18, X-04 (titles), X-05 (loading), reduced-motion on landing, `Review now` markup, M-02, M-03, A-10, A-14, X-13 (dialog naming/tokens).

### 2. Cross-application consistency (1–3 weeks)
X-10 date helper, X-06 notice/toast, X-08 button set (including removal of dead class names), X-01 confirm API + converting all call sites, X-09 menu/tab semantics, X-11 `PageHeader`, X-12 empty states, terminology matrix applied to labels and headings (X-03 first pass: rename only, no URL changes), X-15/X-16 contrast and link affordance.

### 3. Workflow restructuring (3–6 weeks)
A-02 landing work queue, A-03 inline badges replace the modal, A-04/A-05 recompose People and System, A-06 flatten Webmaster nav, A-07 Messages bulk actions, A-08 permission presets, A-09 New-document stepper, C-01/C-02 Account sections and first-run checklist, M-01 Home cards, X-07 dirty-state guard across editors, M-05 profile autosave states.

### 4. Longer-term design-system work (ongoing)
Navigation schema (Larger #1), token consolidation (Larger #8), DataTable/RecordCard components, SVG icon set (X-17), unified People and Activity models (Larger #4–5), URL renames with redirects once labels have settled.

---

## Validation Plan (what code reading cannot answer)

1. Keyboard-only pass through: Webmaster flyouts, user menu, envelope, Postmaster tables, Directory cards, Alerts modal. Confirm focus order, traps and Escape.
2. Screen-reader pass (VoiceOver/NVDA): headings containing buttons, `role="menu"` on non-menus, `role="tab"` + `aria-pressed`, live regions (duplicated or missing announcements), `<h2>` inside `<summary>`.
3. Navigation timing on a throttled connection to confirm whether missing `loading.tsx` produces a perceptible dead state.
4. Short-viewport check (≈700 px tall laptop) of the sticky sidebar with the Services menu.
5. Dark-mode review of inline hard-coded colours, the dialog, Account banners.
6. Confirm whether the site's global CSS defines `.btn`, `.btn-main`, `.btn-sm`, `.primary`, `.bad`.
7. 5-user task test: "approve the newest applicant", "turn on Sam's Tours access", "find where to set up phone alerts", "delete a draft email".
8. Check `public/admin-brain.svg` exists in every deployment (empty landing otherwise).
