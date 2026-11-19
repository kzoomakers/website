# Plan: talk.kzoomakers.org, an embedded port of Lobsters

Status: phases 0–2 merged (#185–#189). Phase 3 in progress: pure logic (hotness, confidence, URL normalize) done in `web/feed/logic.ts`; markdown (`markdown.ts`) and the SSRF-safe fetch (`fetch-url.ts`) done; submit, comments, votes, karma, rate limits still to do. Source inventoried: `lobsters/` (untracked clone, Rails 8 / Ruby 4.0.10 / SQLite). Target: `web/` (Next.js 16, React 19, Postgres, Fly.io).

## 0. Decisions this plan assumes

Push back on any of these before work starts.

| # | Decision | Why |
|---|---|---|
| D1 | **Port to TypeScript inside `web/`. Do not run the Rails app.** | You said "native server, embedded". One Fly app, one Postgres, one deploy, one admin. Rails would add a second runtime, Ruby 4, SQLite and a second deploy. |
| D2 | **Same Next app, host-routed.** `talk.kzoomakers.org` is rewritten in `middleware.ts` to an internal route tree. The main site's host never serves it. | "Separate website, but embedded." Shared code (mail, S3, limits, audit) comes for free. |
| D3 | **Separate Postgres schema `feed`** with Lobsters' own table names (`feed.users`, `feed.stories`, `feed.comments`, `feed.tags`...). | The main DB already has `categories` and `comments`, and Lobsters has `users`, `categories`, `comments`, `messages`. A schema keeps the port 1:1 and isolated. It can be dropped with `DROP SCHEMA feed CASCADE`. |
| D4 | **Lobsters URLs, markup, CSS and behavior stay as they are.** Auth, branding, integrations and ops are what change. | "Close to 1:1." The ERB views are re-expressed as React server components with the same class names and DOM. The 2,168-line `application.css` and the theme files are copied verbatim. |
| D5 | **"Google IAP" means Google sign-in restricted to the `kzoomakers.org` Workspace domain**, reusing `web/auth.ts`: `email_verified` plus the `hd` claim, plus `ADMIN_EMAILS`. It does not mean the GCP Identity-Aware Proxy product. | IAP is a GCP load-balancer feature and the app runs on Fly. Google sign-in with the `hd` check is the same outcome, and it is already built. |
| D6 | **Feed accounts are separate from `site_users`**, but linked. A feed user row optionally points at `site_users.id`. | Members, admins and externals have very different trust. External sign-ups must never create a `site_users` row, because that would put them in the member approval queue, the CRM and the PII export. |
| D7 | **Keep Lobsters' trust model (karma, new-user period, flagging thresholds), but make the constants admin-tunable** and default them to small-community values. | Lobsters' `MIN_KARMA_TO_FLAG = 50` and `NEW_USER_DAYS = 70` assume thousands of users. Left as-is, nobody here could flag anything. |

### Resolved decisions (confirmed by you)

| Question | Answer |
|---|---|
| Does upstream's "no LLM contributions" policy bind this port? | **No.** It is a private derivative. Never send patches, issues or PR text upstream. |
| "Google IAP" | **Google sign-in restricted to `kzoomakers.org`** (the D5 reading). Not the GCP IAP product. |
| Member login | **One-time handoff** (3.2). No shared cookie. |
| Launch signup | **`signup=invite`, `invites.who=members+trusted`, `invites.requests=off`.** |
| Member trust and moderators | **Members trusted immediately** (`members.trusted=on`). **Moderators are admins only.** |
| Read access | **Public read, and search engines may index it.** No noindex. |
| `lobsters/` in the repo | **Not gitignored, not committed.** It stays untracked and is used only as a reference and parity target. |
| Tag seed and markdown | **Makerspace tag seed** (3d-printing, laser, woodworking, electronics, plus meta/ask/show/announce). **`markdown-it`** is the one new dependency. |
| Invite limits | **5 outstanding per user, 14-day expiry.** |
| Trust constants | **`newUserDays` 14, `minKarmaToFlag` 10** (and the other small-community values in 4.1). Revisit after a month of use. |
| Deferred features | **Story cards, stats graphs and mailing-list mode move into launch scope** (phase 6). Hotspots stay in phase 5. Story text/cache links stay deferred. |
| Member feed username | **The member picks it on first visit.** Never derived from legal name or email. |

---

## 1. Inventory of `lobsters/`

### 1.1 Size and stack

| Thing | Count / detail |
|---|---|
| Ruby in `app/models`, `controllers`, `helpers`, `extras` | about 11.4k lines. Biggest: `story.rb` 1424, `user.rb` 654, `comment.rb` 653, `stories_controller` 518, `comments_controller` 468, `home_controller` 385, `search.rb` 341, `sponge.rb` 308 |
| Views | 131 ERB/builder templates |
| CSS | `application.css` 2168 lines, plus 3×3 theme files (`{light,dark,system}-{normal,high,system}.css`, about 78 lines each) |
| JS | `user.js` 1019 lines and `application.js` 50 lines. Plain vanilla ES modules, no framework. Vendored TomSelect and autosize. |
| DB | 41 tables (`db/schema.rb`), SQLite, FTS5 for search |
| Routes | 296 lines in `config/routes.rb` |
| Tests | 117 spec files (rspec): models, controllers, features, requests, routing, jobs, mailers |
| Jobs | solid_queue plus `config/recurring.yml` (about 15 recurring jobs) |
| License | BSD-3-Clause, `lobsters/LICENSE` (see section 11) |

### 1.2 Feature inventory and disposition

Legend: **PORT** means faithful port. **ADAPT** means ported with a deliberate change. **DEFER** means later phase. **DROP** means not ported.

**Stories**

| Feature | Where in Lobsters | Disposition |
|---|---|---|
| Submit story: url or text, tags, title, "I'm the author", description, `fetch_url_attributes` (title/canonical/author from the URL) | `stories_controller`, `extras/sponge.rb`, `link.rb` | PORT. The fetcher is ADAPT (see 5.9). |
| Duplicate-URL check (`check_url_dupe`), URL normalization, `origins`, `domains` | `story.rb`, `domain.rb`, `origin.rb`, `story_urls_controller` | PORT |
| Edit window (6 h), delete/undelete (deletable 28 days), disown | `story.rb` constants | PORT |
| Voting: upvote, flag (reasons), unvote; flaggable only 14 days / score > -5 | `vote.rb`, `story.rb` | PORT |
| Hide, unhide, save, unsave; `/hidden`, `/saved`, `/upvoted/*` | `home_controller`, `hidden_story`, `saved_story` | PORT |
| Merge duplicate stories (`merged_story_id`) | `story.rb`, mod stories | PORT |
| Hotness (`calculated_hotness`, 22 h window, tag `hotness_mod`, 0.25 author bump) | `story.rb:590` | PORT, with a unit test against Ruby-computed values |
| Title/tag suggestions by other users (karma ≥ 10) | `suggestions_controller`, `suggested_*` | PORT |
| Story text and caches (`story_texts`, archive links `_caches`) | `story_text.rb`, `_caches.html.erb` | DEFER. Cache links need the archive.org/archive.ph URL logic. |
| Story OG image cards | `story_image.rb` (ruby-vips), `story_image_controller` | ADAPT with `sharp` (already a dependency). **In launch scope** (phase 6). |
| Similar-story box on submit | `_similar.html.erb` | PORT |

**Comments**

| Feature | Disposition |
|---|---|
| Threaded comments, `MAX_DEPTH = 18`, `/comments`, `/c/:id` short-id redirect, `/threads`, `~user/threads` | PORT |
| Confidence ordering (Wilson 80% lower bound, `confidence_order` 3-byte path sort via recursive CTE) | PORT. SQLite `unhex`/blob path becomes `bytea` or a padded text path in a Postgres recursive CTE. |
| Vote on comments, flag (karma ≥ 50 default), score hiding in range -2..4, collapse at -5 | PORT with tunable constants |
| Edit window 6 h, delete/undelete, disown after 28 days | PORT |
| Thread speed limit (`breaks_speed_limit?`) | PORT |
| Comment preview, markdown help, reply-in-place, `comment_vote_hydrator` | PORT |
| `comments.rss`, `~user/comments.rss`, `/upvoted/comments` | PORT |

**Listing and navigation**

| Feature | Disposition |
|---|---|
| Home (hottest), `/active`, `/newest`, `/recent`, `/top/:length` (1d, 1w, 1m, 1y), `/page/:n` | PORT |
| `/t/:tag` (also `/t/a,b` multi-tag), `/categories/:c`, `/domains/:d`, `/origins/:o`, `~user/stories` | PORT |
| `.rss` and `.json` variants of nearly all of the above | PORT. Route handlers, not pages. |
| `/search` (parslet `search_parser`, FTS5 across stories, comments, users, tags) | ADAPT. Postgres `tsvector` plus GIN, and the parser is re-written by hand (about 70 lines). |
| `/tags`, `/filters` (per-user tag filters), `/stats` (graphs from `svg-graph`) | PORT. Stats graphs are **in launch scope** (phase 6), rendered as inline SVG by a small function. |
| `/about`, `/privacy`, `/chat`, `/404`, `/banned-ips`, `/cabinet` | ADAPT. `about`, `privacy` and `chat` are rewritten for Kzoo Makers (the content is Lobsters-specific). `banned-ips` is DROP unless IP bans are wanted. `cabinet` (Faker fake data) is DROP. |

**Users and social**

| Feature | Disposition |
|---|---|
| Profile `~user`, `standing`, `/users` invite tree, `/moderators`, `disable/enable_invitation` | PORT |
| Karma accounting, `is_new?`, ban/unban with reason and ban email, `deleted_at`, `good_riddance?` | PORT |
| Hats and hat requests (`hats`, `hat_requests`, doff) | PORT |
| Inbox (`/inbox`, `/inbox/all`, `/inbox/unread`) and notifications (`notifications` table, `notify_comment_job`) | PORT |
| Private messages (`/messages`, sent, batch delete, mod notes on messages) | PORT |
| Settings (email, password, about, theme, contrast, tag filters, notification prefs) | PORT |
| 2FA (TOTP via `rotp` and `rqrcode`), password reset, session token roll | PORT for external accounts. Not offered to Google or member accounts (D6, section 3). |
| Avatars (`avatars_controller`, Gravatar fetch and caching) | ADAPT. No Gravatar (it leaks email hashes to a third party). Members use their `site_users.avatar`. Everyone else gets a generated SVG avatar. |
| Mailing-list mode (digest of new stories by email), RSS token | PORT both. RSS token is phase 4. Mailing-list mode is **in launch scope** (phase 6), using the mail queue in `lib/mail.ts`, with unsubscribe links and a per-user opt-in (default off). |
| Reply by email (`mailboxes/inbox_mailbox`, ActionMailbox) | DROP |
| Link accounts: Mastodon, GitHub (`settings#*_auth`, `extras/mastodon.rb`, `github.rb`, `mastodon_apps`) | DROP v1. The profile can still show a free-text link. |
| Pushover notifications | ADAPT to **ntfy**, which the main app already runs (`lib/ntfy.ts`). Per-user topic, same "mentions/replies/messages" prefs. |
| Webmentions (`send_webmention_job`) | DROP |

**Moderation**

| Feature | Disposition |
|---|---|
| Mod log `/moderations` (public) | PORT |
| `/mod` activity, flagged stories/comments/commenters by period, hotspots (`hotspot_*` tables and `HotspotRefreshJob`) | PORT. Hotspots are phase 5, since they are a heavy tf-idf job. |
| Mod mail (`mod_mails`, `mod_mail_messages`, recipients, references, email copies) | PORT |
| Mod notes, reparent comments, edit/delete any story or comment, domain and origin bans, tag create/edit, category create/edit | PORT |
| Invitation requests queue (`invitation_requests`, confirm-email flow) | PORT, behind a toggle (section 4) |
| Banned-IP list, ASN ban script | DROP. Use the existing per-IP limiter in `lib/limit.ts` and Fly. |

**Platform and ops (none of this is ported as-is)**

| Lobsters | Replacement in the main app |
|---|---|
| rack-attack (rate limits) | `lib/limit.ts` `hit()`. Keep Lobsters' numbers (4/s, 30/min, 100/10min, 400/h per IP, login 4/min, user-enumeration 30/5min). |
| solid_queue, solid_cache, `recurring.yml` | `instrumentation.ts` `job(id, ms, fn)` with `withLock`, the pattern the app already uses. Caching is described in 5.8. |
| Action Mailer (6 mailers) | `lib/mail.ts` `send` (SMTP2GO or SMTP) with the admin-configured sender. |
| ActiveStorage | `lib/s3.ts` (already used for uploads) |
| restic backup job, WAL checkpoint | DROP. The Postgres backup policy already covers the shared DB. |
| Sentry, Telebugs, lograge, mini-profiler, flamegraph, stackprof, memory_profiler, mission_control-jobs | DROP. Use `lib/httplog.ts` and the debug page. |
| sitemap_generator | `app/sitemap` for the feed host, generated from `feed.stories`. |
| `email_blocklist`, `iana_tlds` fetch jobs | PORT as two hourly or daily jobs, because they validate signup email and story URLs. |

### 1.3 Data model (41 tables)

| Port as `feed.*` | Notes |
|---|---|
| `users`, `usernames` (rename history), `invitations`, `invitation_requests` | `users` gains `kind` (`admin`/`member`/`external`), `site_user_id`, `google_sub`, and drops `session_token` (new session scheme). |
| `stories`, `story_texts`, `taggings`, `tags`, `categories`, `tag_filters`, `domains`, `origins`, `links`, `hidden_stories`, `saved_stories`, `read_ribbons`, `suggested_taggings`, `suggested_titles` | `stories.hotness` and `comments.confidence` stay stored columns, as in Lobsters. |
| `comments`, `comment_stats`, `votes`, `notifications`, `messages` | `comments.confidence_order` (blob) becomes `bytea`. |
| `moderations`, `mod_notes`, `mod_mails`, `mod_mail_messages`, `mod_mail_recipients`, `mod_mail_references`, `mod_activities` | |
| `hats`, `hat_requests`, `keystores` | |
| `hotspot_docs`, `hotspot_terms`, `hotspot_term_counts` | Phase 5. |
| **Not ported:** `action_mailbox_inbound_emails`, `active_storage_*` (3), `mastodon_apps` | |

SQLite-to-Postgres gotchas to handle explicitly (each needs a test):
- `COLLATE NOCASE` on `users.username/email`, `tags.tag`, `categories.category` becomes `citext`, or `lower()` unique indexes if the extension isn't allowed.
- `unhex()`/blob path sorting becomes `bytea`.
- FTS5 contentless tables become `tsvector` generated columns with GIN indexes.
- Integer short-ids: Lobsters uses 6-char `short_id`s (`short_id.rb`). Keep the same alphabet and length so URLs look identical.
- `typeid` and `activerecord-typedstore` (user settings as typed JSON) becomes a `settings jsonb` column with a zod-style validator in code.

---

## 2. Architecture inside `web/`

### 2.1 Host routing and URL fidelity

`middleware.ts` already runs on Node for every request. Add one branch at the top:

```
host === FEED_HOST (talk.kzoomakers.org, plus localhost with ?__feed=1 or FEED_DEV=1)
  → NextResponse.rewrite(feedRewrite(req.nextUrl))
host !== FEED_HOST and path starts with /feed-site  → 404   (no direct access)
```

Constraints that shape the design:
- Next dynamic segments must span a whole segment, so `/~alice` cannot be `~[user]`. `feedRewrite()` is a single pure, unit-tested function that maps public Lobsters URLs to internal ones: `/~alice` → `/feed-site/u/alice`, `/t/c,python.rss` → `/feed-site/rss/t/c,python`, `/newest.json` → `/feed-site/json/newest`, `/s/abc123/some-title` → `/feed-site/s/abc123`. It also keeps the legacy redirects (`/u/x`, `/@x`, `/newest/:user`, `/domain/...`, `/replies*`, `/top/rss`).
- `.rss` and `.json` are route handlers (`route.ts`), not pages. HTML is pages.
- **Parity test:** table-drive every pattern in `lobsters/config/routes.rb` (296 lines) through `feedRewrite()` and assert the target exists. This catches drift for free.
- The existing matcher excludes some upload paths. Feed upload endpoints (avatar, if added) must be listed there or go through `uploadGate`.
- Feed requests should skip the main site's `LinkTracker`/GA/cookie-consent. See 2.2.

### 2.2 Layout isolation

The root `app/layout.tsx` renders `SubscribeForms`, `LinkTracker`, `GaTag` and `CookieConsent` for every page. The feed needs its own `<html>`, `<head>` (theme-color, its own favicon, theme stylesheet) and body.

- **Chosen:** middleware sets `x-feed: 1` on the rewritten request. `RootLayout` reads `headers()` and returns the feed shell instead of the site shell. The cost is that the root layout becomes dynamic. The site is already cookie-driven (`me()`, `currentMember()`), so little is lost.
- **Rejected:** route groups with two root layouts. It means moving every existing top-level folder under `app/(site)/`, a large noisy diff in unrelated code.
- No Google Analytics on the feed by default (privacy page says so). Optional later via the existing `lib/ga.ts` config.

### 2.3 Code layout (everything feed-specific lives in two folders)

```
web/app/feed-site/            routes only; thin, mirror Lobsters' controllers
  layout.tsx page.tsx         home (hottest)
  newest/ active/ recent/ top/[[...length]]/ ...
  s/[id]/ c/[id]/ u/[username]/ t/[tag]/ domains/[id]/ origins/[...id]/ ...
  rss/…  json/…               route handlers for the .rss / .json variants
  mod/…  settings/…  invitations/…  messages/…  inbox/…
web/app/admin/services/feed/  admin settings page (4.3) and moderation hand-off
web/feed/                     all logic, no Next specifics
  schema.ts        migrations (applyOnce pattern from lib/db.ts, advisory lock)
  models/          story.ts user.ts comment.ts vote.ts tag.ts domain.ts origin.ts invitation.ts ...
  hotness.ts confidence.ts url-normalize.ts markdown.ts search.ts search-parser.ts
  fetch-url.ts     SSRF-safe URL metadata fetch (replaces sponge.rb)
  auth.ts          sessions, handoff tokens, password, TOTP, role mapping
  config.ts        feed settings (settings key 'feed:config'), tunable constants
  jobs.ts          registered from instrumentation.ts
  views/           React server components, one per ERB template, same class names
web/public/feed/               copied CSS, vendored JS, images (see 6)
web/tests/feed-*.test.mjs      node:test, same style as the rest
```

Rule: `web/feed/**` may import shared libs (`lib/db`, `lib/mail`, `lib/limit`, `lib/s3`, `lib/store` audit, `lib/ntfy`, `lib/sanitize`). Nothing outside `feed/`, `app/feed-site/`, `app/admin/services/feed/` and the glue points in section 9 imports from `feed/`. Add a test that greps for violations.

### 2.4 Database access

- Same pool (`conn()` from `lib/db.ts`). Qualify every table as `feed.x`. **Do not** set a global `search_path`, since that would affect the main app on pooled connections.
- Migrations: `web/feed/schema.ts` `ensureFeedSchema()` using the same advisory-lock-then-`applyOnce` approach as `ensureSchema`, called from the same startup path. Idempotent `CREATE SCHEMA IF NOT EXISTS feed`.
- Lobsters' schema is the spec. Generate the Postgres DDL once from `db/schema.rb`, review by hand, commit it as the baseline migration, and add later changes as `applyOnce` entries.
- Each Lobsters foreign key is kept (`remove_cascade_from_foreign_keys` migration shows they care about NO ACTION semantics).

### 2.5 Background jobs

Register in `instrumentation.ts` with `job(id, ms, fn)` and unique advisory ids (next free after 7351932; check before use).

| Job | Cadence | Source |
|---|---|---|
| Notify on comment / message / mod mail | enqueue-on-write, drained by a 10 s tick | `notify_*_job` |
| Refresh hotness for recent stories | every few minutes | `Story.recalculate_all_hotnesses!` |
| Comment stats fill, read-ribbon expiry | daily | `recurring.yml` |
| Flagged-commenters cache | 15 min | `FlaggedCommenters` |
| Email blocklist, IANA TLD fetch | daily | `fetch_*_job` |
| Hotspot index/refresh | phase 5 | `hotspot_*_job` |
| Page-cache prefill | not needed (see 5.8) | |

---

## 3. Identity, sessions and roles

### 3.1 Three kinds of account

| Kind | How they get in | Feed role | Link |
|---|---|---|---|
| **admin** | Google sign-in, `hd = kzoomakers.org` (or exact `ADMIN_EMAILS`) | `is_admin` and `is_moderator` (full Lobsters mod powers). Created on first sign-in. | `google_sub`, email |
| **member** | Existing Kzoo Makers member login (`currentMember()`: approved and onboarding done) | normal user, "established" (skips new-user limits, see D7). Created on first visit. | `site_user_id` |
| **external** | Registers on the feed with email and password (invite or open, per 4) | normal user, "new" for 70 days (tunable) | none |

- Admin detection reuses `isAdmin()` and the same two-part rule in `auth.ts` (verified email, and either an exact `ADMIN_EMAILS` match or a matching `hd` claim). **Do not loosen it.** A personal Google account that merely uses a kzoomakers.org address must be refused, as in the current code.
- A site admin who is *also* a member signs in as admin. One feed user per person: key on lowercased email, and the first successful login of a higher-trust kind upgrades `kind`. It never downgrades. Admin status is re-derived at each login, so removing someone from `ADMIN_EMAILS` or disabling their site account demotes them on their next request.
- Disabled or rejected `site_users` (see `currentApplicant`) cannot use the member path. Banning a feed user does not touch their site account, and vice versa.

### 3.2 Cross-host session

The main site's `blog_session` cookie is host-only to `kzoomakers.org`, and NextAuth's admin cookies are too. The feed host cannot read them. Two options:

- **A. `Domain=.kzoomakers.org` on `blog_session`.** True SSO, but it widens the cookie to every subdomain and changes behavior of an auth cookie the whole site depends on. **Rejected.**
- **B. One-time handoff (chosen).** On the feed, "Log in as a member" and "Log in as admin" redirect to the main host: `https://kzoomakers.org/feed-sso?role=member|admin&return=<feed path>`.
  - The main host already knows who the visitor is (`currentMember()` or NextAuth `auth()`). If not signed in it shows the normal login and comes back.
  - It mints a **60-second, single-use, HMAC-signed token** (reuse `mac()` from `lib/readers.ts`, bound to the audience `feed`, the email, the role and a nonce stored in `settings`/a small table to prevent replay) and redirects to `https://talk.kzoomakers.org/login/handoff?t=…`.
  - The feed verifies it, upserts the feed user and sets its own `feed_session` cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, host-only, signed with a distinct secret derivation (`AUTH_SECRET + "|feed"`), with a stored `session_version` for revocation (the same idea as the main site's `session_version`).
  - `return` goes through the existing `safeNext()` rules, so only same-site paths are allowed. No open redirect.
- Google OAuth: only the main host performs the OAuth round-trip, so the existing `AUTH_URL` and redirect URI stay as they are. **No second OAuth client or redirect URI is needed.**
- Feed login page (`/login`) shows: *Members and admins*: two buttons (handoff). *Everyone else*: email/password form plus "Create account". It keeps Lobsters' login layout and copy tone.

### 3.3 External accounts

- Email + password (scrypt via the same helper as `hashPw`, **not** bcrypt; do not add a dependency), `/login/forgot_password`, `/login/set_new_password`, optional TOTP 2FA (add `otpauth`, or implement RFC 6238 with `node:crypto` in about 30 lines; `qrcode-generator` is already a dependency for the QR).
- Email verification before the account can post (Lobsters relies on the invite for that. Open sign-up needs it).
- Throttles: signup 3/h/IP (like `SIGNUPS_PER_HOUR`), login 4/min/IP and per-account, password reset per-email, via `hit()`. Optional CAPTCHA: reuse `lib/captcha.ts` on signup when open registration is on.
- Usernames: Lobsters' `Username` rules and `usernames` history table; reserved names (`admin`, `system`, `inactive-user`, the moderator names).

---

## 4. Invitations and sign-up controls

Requirement: external users can register, **the invite feature holds for them, and it can be toggled.** Everything below is stored in `settings` under `feed:config` and edited in **Admin → Services → Feed** (new page, new RBAC section `feed`, mirroring the existing services pages and the "can be switched off in admin" pattern from the donate change).

### 4.1 Settings

| Setting | Values (default in bold) | Effect |
|---|---|---|
| `enabled` | **on** / off | Off: feed host returns the same 404 as an unknown host and the "Feed" menu entry disappears. Content is kept. Admin access stays. |
| `signup` | `invite` / `open` / `closed` (**invite**) | `invite`: external accounts require a valid invitation code. `open`: anyone may register (email verified, CAPTCHA, rate limits). `closed`: no external registration even with a code. Members and admins are unaffected: they get in through handoff. |
| `invites.who` | `staff` / `members` / **`members+trusted`** / `everyone` | Who may *send* invitations. `staff` is admins and moderators. `members` also adds Kzoo members. `members+trusted` also adds external users past the new-user period with karma ≥ threshold (Lobsters' `can_invite?`). `everyone` is any non-banned user. |
| `invites.requests` | on / **off** | The public "request an invitation" form and queue (`/invitations/request`, `invitation_requests`, email confirm, mods approve). |
| `invites.perUserLimit`, `invites.expiryDays` | defaults 5 outstanding, 14 days | Lobsters has no expiry. Add one, since a stale code is a standing open door. |
| `invites.tree` | on | Show `/users` invite tree (Lobsters feature; set off for privacy). |
| `approval` | on / **off** | Hold new external accounts for admin approval. A knob for `open` mode. |
| `members.autoCreate` | **on** / off | Members get a feed account on first visit. Off means they must be added by an admin. |
| Trust constants | `newUserDays` (70 → **14**), `minKarmaToFlag` (50 → **10**), `minKarmaToSuggest` (10 → **3**), `minKarmaToSubmit` (-4), `minKarmaForInviteRequests` (50 → **10**) | See D7. Lobsters' values are the documented fallback. |
| `members.trusted` | **on** | Members and admins are never "new" (skip speed limits, the new-user badge and restrictions). |
| `readOnlyPublic` | **on** | Logged-out visitors can read (Lobsters is public). Off requires login for everything, as a pre-launch lock. |

### 4.2 Behavior matrix

| | admin | member | external, invited | external, open reg |
|---|---|---|---|---|
| Read | ✓ | ✓ | ✓ | ✓ (and logged out if `readOnlyPublic`) |
| Post / comment / vote | ✓ | ✓ | ✓ after email verification | ✓ after email verification (+ approval if set) |
| Send invites | always | per `invites.who` | per `invites.who` | per `invites.who` |
| Moderate | ✓ | ✗ (can be granted by an admin as with Lobsters' `grant_moderatorship`) | ✗ | ✗ |

### 4.3 Flow

1. `/invitations` (send): form (email, memo) → row in `feed.invitations` (`code` 15 chars, `user_id`, `email`, `memo`, `expires_at`, `used_at`, `new_user_id`) → `lib/mail.ts` invitation email using the Lobsters wording, with the sender and site URL from mail settings.
2. `/invitations/:code` → signup page prefilled with the invited email. The code is consumed in the same transaction that creates the user. The new user records `invited_by_user_id`, and the tree is preserved.
3. `signup=invite` with no or invalid code: `/signup` shows "invitation only" and the request form if `invites.requests` is on. `signup=closed`: shows a closed notice and no form.
4. Disable and enable a user's invites (`disable_invite_by_user_for_reason!`) works as in Lobsters, with the reason shown to the user.
5. Invitation emails go through the blocklist and TLD checks (ported jobs). Rate limit invite sending per user and per IP.
6. Audit: every settings change and every invite/ban/approval is written with `logAudit` (existing `lib/store.ts`), so it shows in Admin → Services → Audit.

---

## 5. Porting the logic (the parts that must be exact)

For each item below, write the Ruby-derived expected values into a fixture and test the TypeScript against them. These are where a "faithful" port drifts silently.

1. **Story hotness** (`story.rb:590–619`): `-(order*sign + base + created_at/HOTNESS_WINDOW).round(7)`, with `base = Σ tag.hotness_mod + (author-submitted URL story ? 0.25 : 0)`. Recompute on every vote, flag, tag change and merge.
2. **Comment confidence** (`comment.rb:calculated_confidence`): Wilson lower bound, z = 1.281551565545 (80%). Clamp to 0..1. `confidence_order` is 2 bytes of `65535 - floor(conf*65535)` big-endian plus 1 byte of id, concatenated up the path. Thread order comes from the recursive CTE sorted on the byte path. Postgres `bytea` sorts bytewise, so it matches.
3. **Karma**: where it is incremented or decremented (vote on own story or comment, flag penalties, `Vote.vote_thusly_on_story_or_comment_for_user_because`), including the rule that flaggers cannot have replied in the thread (`validate_flagger_hasnt_replied`, `validate_commenter_hasnt_flagged_parent`). Wrap in one transaction to avoid double-counting under concurrent requests (Lobsters relied on SQLite's single writer).
4. **Windows and limits**: `FLAGGABLE_DAYS 14`, `DELETEABLE_DAYS 28`, `MAX_EDIT_MINS 360`, `COLLAPSE_SCORE -5`, `SCORE_RANGE_TO_HIDE -2..4`, story `FLAGGABLE_MIN_SCORE -5`, comment `-10`, title 3–150 chars, `MAX_DEPTH 18`, 25 stories/page, 20 comments/page, 50 moderations/page.
5. **Markdown** (`extras/markdowner.rb`): CommonMark with GFM autolink, strikethrough and tagfilter. Raw HTML escaped (`escape: true`), headings become `<strong>`, `rel="ugc"` plus `nofollow` on links, `@user`/`~user` mentions linked as of the post date, images only when the story can have images. Use `markdown-it` (**one new dependency; the repo has no CommonMark library**) with `html: false, linkify: true`, then post-process with `cheerio` (already installed) and finish through `lib/sanitize.ts`. Golden-test it against Ruby output for the markdown cases in `spec/` (fixtures exist).
6. **URL normalization and dupes** (`story.rb`, `link.rb`, `domain.rb`, `origin.rb`): port the exact tracker-parameter and host-normalization rules, since duplicate detection depends on byte-identical normalization. The origin list (github.com/user etc.) is data in `domain.rb` or `origin.rb`. Copy it.
7. **Search** (`search.rb`, `search_parser.rb`): operators (`tag:`, `domain:`, `user:`, `is:`, quoted phrases, `order:`), scopes (stories, comments, users), pagination. `tsvector` with the `simple` or `english` config chosen so that results match Lobsters closely. Document known ranking differences.
8. **Caching**: Lobsters uses file/page caching plus fragment caching. Port as an in-process LRU with a short TTL (30–60 s) for logged-out home, newest, tag and story pages, purged on any write that affects them. Logged-in views are never cached. Fly runs one machine today. If it scales out, switch the cache to a Postgres-backed TTL table.
9. **URL metadata fetch** (`sponge.rb`, 308 lines): this is an SSRF defense, not a convenience. Port its rules: resolve DNS first, reject private, loopback, link-local and metadata ranges (`BadIPsError`, `NoIPsError`, `DNSError`), connect to the **resolved IP** (no TOCTOU rebinding), cap redirects, response size and time, accept only http/https and ports 80/443, set a clear User-Agent. Test with a local server on 127.0.0.1, a hostname that resolves to a private IP, and redirect-to-private.
10. **Time zone**: Lobsters renders in "Central Time". Store UTC and render in the viewer's zone through the existing `<time data-at-unix>` client script, as Lobsters does. Cron-like jobs use America/Detroit if they care about the day.
11. **Pagination, ETag and RSS/JSON shapes**: the JSON field names and RSS item structure (`stories.rss.builder`, `as_json` on each model) must match exactly. Scripts and readers depend on them. Diff against real Lobsters output.
12. **Email templates**: 6 text mailers (invitation, invitation request, reply and mention, message, mod mail, password reset, ban notification). Copy the wording, change the branding.

---

## 6. UI and theme

- **CSS**: copy `app/assets/stylesheets/*` to `web/public/feed/css/` unchanged. Serve with `<link>` choosing `{light|dark|system}-{normal|high|system}.css`, as in `layouts/application.html.erb:36` (`prefers_color_scheme` × `prefers_contrast`). **That gives the dark theme you asked for with zero redesign.** Lobsters already ships `dark-normal`, `dark-high` and system-following variants, built on `--base-bg` / `--base-fg` and opacity tokens.
- Default for logged-out visitors: `system` (follows the OS). Persist the choice in the user's settings, and for logged-out visitors in a plain cookie `feed_theme`, which is a per-viewer convenience only.
- Because there is no CSS build step, `lib/sechead`'s CSP (Admin → Security headers) must allow the feed host's assets and the inline `<time>` script. Prefer a nonce, not `unsafe-inline`.
- **Markup parity rule:** React components output the same elements, IDs, classes and `data-*` attributes as the ERB. `user.js` (1019 lines) depends on them (voting, reply boxes, preview, TomSelect tag picker, keyboard shortcuts, collapse). Copy `application.js`, `user.js` and the vendor files to `web/public/feed/js/` unchanged and load them as modules. Do not rewrite them as React islands in v1. Server components stay static and `user.js` drives the behavior.
- Layout shell (`layouts/application.html.erb`, 162 lines): header, nav, subnav, footer, flash messages, the "new stories" favicon badge.
- Branding: replace the Lobsters logos (`logo-*.svg`), the `#AC130D` theme-color, site name, the About text and the footer. Keep all structure.
- Accessibility: Lobsters ships a high-contrast mode. Keep it. Run an axe check on the ported home, story, comment and form pages.

---

## 7. Phases

Each phase ends in a deployable state behind `enabled=off`, so `main` stays shippable. Estimates are rough working days for one person.

| # | Phase | Deliverable / exit criteria | Est. |
|---|---|---|---|
| 0 | **Scaffold** | `feedRewrite()` plus the middleware branch, the feed root-layout branch, the `feed` schema baseline migration, the `feed:config` settings, the admin page with `enabled`. DNS and Fly cert for `talk.kzoomakers.org`. Hello-world page on the host, 404 on the main host. | 2 |
| 1 | **Read-only core** | Models: stories, tags, users, comments, domains. Pages: home, newest, active, recent, top, tag, domain, origin, story with threaded comments, user profile. RSS/JSON for these. CSS/JS copied, themes working. A seed script loads the Lobsters fixtures. **Parity diff vs Rails on seeded data passes** (see 8). | 6–8 |
| 2 | **Identity** | The handoff for admin and member, `feed_session`, role derivation, external register/login/reset, email verification, sessions. Authz tests (section 8). | 4–5 |
| 3 | **Write path** | Submit and edit story (fetch metadata, dupe check, similar), comment/reply/edit/delete, vote/flag/hide/save, karma, hotness and confidence, markdown with preview, rate limits, speed limits. | 7–9 |
| 4 | **Invites and settings** | Section 4 in full: invitations, requests, the toggles, the admin UI, the invite tree, user settings, tag filters, 2FA. | 4–5 |
| 5 | **Social and moderation** | Inbox, notifications (and ntfy), messages, hats, suggestions, the mod log, mod mail, mod notes, bans (and ban email), reparent, domain and origin bans, flagged views, tag and category admin, hotspots. | 7–9 |
| 6 | **Polish and ops** | Search, stats graphs, sitemap, About/privacy/chat copy, story cards, avatars, mailing-list mode, perf pass, load test, backup/restore check, runbook. Hotspots stay in phase 5. | 7–9 |
| 7 | **Launch** | Real-data dry run, invite the first cohort, set `enabled=on`, `signup=invite`. Public read and indexable from day one (sitemap and robots allow the feed host). | 1–2 |

Total roughly 38–49 working days. The write path and moderation are the bulk. Phase 1 is the checkpoint for the "faithful" claim, so do not start phase 3 before it passes.

---

## 8. Testing and parity

- **Unit tests** (`node:test`, `web/tests/feed-*.test.mjs`, run by the existing `npm test` and CI): hotness, confidence and order path, markdown goldens, URL normalization, search parser, `feedRewrite` against all of `routes.rb`, SSRF cases, role derivation, handoff token (expiry, replay, wrong audience, tampered), invite state machine and every `signup` × `invites.who` combination.
- **Authz tests** (the existing `authz.test.mjs` is the model): every mutating feed endpoint rejects logged-out, banned, unverified and wrong-role callers. External cannot reach `/mod/*`. A member cannot self-grant moderator. `enabled=off` returns 404 on every route including RSS and JSON.
- **Parity harness (the main faithfulness guarantee):** run the Rails app locally from `lobsters/` with its `fixtures/` or seed data, load the same data into `feed.*`, then fetch a list of about 40 URLs from both. Compare normalized HTML (strip CSRF tokens, timestamps, branding strings), JSON and RSS. Fix differences until only the expected branding and auth ones remain. Keep the URL list and expected-diff list in the repo. This is a dev-only script and is never run in CI against production.
- **Port the specs**: `spec/models/{story,comment,user,vote,invitation,tag,domain}_spec.rb` and the feature specs for submit, comment, hide and settings. They become executable acceptance criteria. Translate the cases, not the Ruby.
- **Load test** the home and story pages with the in-process cache on and off, on the 1 GB / 1 CPU Fly machine. The feed shares that machine with the main site.
- **Security checks before launch:** OWASP pass on markdown output (stored XSS), CSRF (see 9), open redirect on `return`, enumeration on login and signup, invite-code brute force (15 chars, rate limited), IDOR on messages and mod mail.

---

## 9. Integration points with the existing app (the only edits outside `feed/`)

| File | Change |
|---|---|
| `web/middleware.ts` | Host branch and rewrite, the 404 for `/feed-site` on other hosts. Security headers for the feed host (own CSP). |
| `web/app/layout.tsx` | Feed shell branch (2.2). |
| `web/instrumentation.ts` | Register the feed jobs. |
| `web/lib/db.ts` | Call `ensureFeedSchema()` after `migrate()`. |
| `web/lib/access.ts` | New section `feed` ("Feed") and its admin pages. |
| `web/lib/menu.ts` / nav | Optional "Community feed" link, shown only if `enabled`. |
| `web/app/feed-sso/` (main host) | The handoff minting endpoint. |
| `fly.toml` / certs | `fly certs add talk.kzoomakers.org`, DNS CNAME. No new service. |
| `web/lib/sechead*` | Feed CSP and allowed origins. |
| `.github/workflows/ci.yml` | Nothing, since the tests run under the existing `test` job. |
| Security audit | Add a feed section to `UX_AUDIT.md` / `ARCHITECTURE_AUDIT.md` once built. |

CSRF: Lobsters uses Rails authenticity tokens. Next has no automatic CSRF. All feed mutations are `POST` with `SameSite=Lax` plus an `Origin`/`Host` check in a shared helper, and a per-session token on forms that change account security (email, password, 2FA, invites). Add this before phase 2, not after.

---

## 10. Privacy, retention and moderation policy

- The main site has PII machinery (`lib/pii*`, retention, the privacy page). The feed holds its own personal data: emails, IPs on signup, private messages. Add the feed tables to the PII inventory and retention policy, and write a feed privacy page (Lobsters' `privacy.html.erb` is the starting text). Do not log IPs beyond what rate limiting needs, and hash them as `lib/comments.ts hashIp` does.
- Hosts and guests: **the feed must never expose `site_users` data** (names, phones, addresses). A member's feed profile shows only the feed username and what they choose to write. The link to the site account is internal.
- Decide whether a member's feed username may be their real name. Default: the member picks a username on first visit. It is not their legal name, and it is never derived from their email.
- Moderation: admins are moderators by default. Document the Lobsters moderation guidelines adapted to a makerspace. Mod actions are public in `/moderations` (Lobsters behavior), so make that a conscious choice and say so on the About page.

---

## 11. Licensing and attribution

- Lobsters is **BSD-3-Clause** (`lobsters/LICENSE`, © joshua stein and contributors). A port is a derivative work. Keep the license text and copyright notice in the repo (`web/feed/LICENSE-lobsters.txt`) and in the feed's About/footer ("based on Lobsters"). Do not use the Lobsters name or logo as ours.
- **Upstream AI policy (resolved):** `lobsters/AGENTS.md` forbids LLM contributions to the Lobsters project. Confirmed: that governs contributions *to upstream*, not this private derivative. **Do not send patches, issues or PR text upstream from this work.**
- **`lobsters/` in the repo (resolved):** it stays untracked (19 MB, own `.git`), neither gitignored nor committed. Because it is a nested git repo, never run `git add -A` or `git add .` at the root. Stage paths explicitly. Use it only as a read-only reference and the parity target. Commit only the ported code.

---

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scope: Lobsters is about 11k lines of Ruby plus 131 views, and "pretty faithful and complete" is open-ended | High | The disposition tables in 1.2 are the scope. Anything marked DEFER or DROP needs an explicit decision to add. The parity harness defines "done". |
| `user.js` coupling to the DOM breaks as components are edited | Medium | Markup parity rule. A DOM-structure snapshot test per component. |
| Feed load or abuse affects the main site (shared 1 GB / 1 CPU machine and DB) | Medium | Separate rate limits, the statement timeout already set on the pool, a cache for logged-out traffic, the `enabled` kill switch, and a per-feed query budget. A dedicated Fly machine is the fallback and needs no code change if jobs are guarded by `withLock`. |
| SSRF and stored XSS: user-submitted URLs and markdown are the biggest new attack surface for the site | Medium | Sections 5.5 and 5.9, the OWASP review in phase 6, and the feed gets its own CSP. |
| SSO handoff bugs become an account-takeover path | Low, impact high | Short-lived, single-use, audience-bound token. Role re-derived server side. Tests for replay and tamper. No cookie sharing (3.2). |
| Postgres ordering and collation differences change listing order vs SQLite | Medium | Parity diff on seeded data, explicit `COLLATE`, ties broken by `id` as Lobsters does. |
| Spam and abuse once `signup=open` | Medium | Default is `invite`. Email verification, CAPTCHA and approval are available before opening up. |
| Upstream security fixes won't reach the port | Medium | Pin the Lobsters commit being ported (`f5193857`). Review upstream `SECURITY.md`/commits quarterly and port relevant fixes by hand. |

---

## 13. Open questions

None. All resolved (see "Resolved decisions" near the top).

---

## 14. First pull request (phase 0, so there is something concrete to review)

1. `web/feed/schema.ts` baseline plus `ensureFeedSchema()` wired in `lib/db.ts`.
2. `web/feed/config.ts`: defaults, `feed:config` get and save, audited.
3. `web/feed/rewrite.ts`: `feedRewrite()` plus a test that reads `lobsters/config/routes.rb` when present, else a checked-in list.
4. Middleware branch, root-layout branch, `app/feed-site/layout.tsx` and a placeholder home.
5. `app/admin/services/feed/` with the `enabled` toggle only, the `feed` RBAC section, and the menu entry.
6. Tests: rewrite, the 404 on the main host, and `enabled=off` returns 404.
