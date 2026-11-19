# PII Audit & Access System

Status: design, not built. Decisions below come from the Q&A with Jon.

## Goal

Nobody sees a member's or guest's personal data without (a) being allowed to, (b) acknowledging how sensitive it is, (c) giving a reason, and (d) leaving a tamper-evident record the board reviews.

## Decisions

| Topic | Decision |
|---|---|
| Who may retrieve | Full admins always. Everyone else must be on the matching special-permission list. |
| Permissions | New special perms: **View Personal Information**, **View Emergency Contacts**, **View IDs**, plus **Audit PII** (oversight page). Built on the existing `special_perms` table and `/admin/users/special` page. |
| Data covered | Member contact info (phone, address, email, birthday), emergency contacts (members and guests), Gov IDs / ID renewals / guest photos, signed docs and waivers. |
| Retrieval flow | Masked by default → **Retrieve info** → confidentiality modal → required reason → revealed until the viewer navigates away (or presses **Hide**). |
| Reason | Required. Pick one of: tour, emergency, ID renewal, safety/incident, legal, other (text required for "other"). Optional free-text note. |
| Own data | A member viewing their own data: logged silently as `self`, no modal, excluded from the board report. |
| Audit page | **Audit PII** under Audit Log. Full admins + the Audit PII special perm. |
| Tamper evidence | Append-only table with a hash chain. No edit or delete in the UI. |
| Retention | Keep forever. Exempt from `lib/retention.ts` pruning. |
| Monthly report | Right after the month ends (so its last evening is included), to `board@kzoomakers.org`, **only if** something was accessed. Counts by viewer and subject, plus reasons. No PII values. |
| Real-time alerts | Bulk-access alert and an admin alert when a non-admin retrieves a Gov ID. |

## Modal wording

> **This is someone's PII (Personally Identifiable Information).**
> It must be kept in strict confidentiality and requested only because you need it.
> If you view this, your request will be logged, and the board is sent monthly updates on this.
>
> Reason: [dropdown] [note]
> [Cancel] [I understand, show it]

The button stays disabled until a reason is chosen.

## Data model

New table `pii_access` (append-only; the app's DB role gets INSERT and SELECT only, no UPDATE or DELETE):

| Column | Notes |
|---|---|
| id | serial |
| at | timestamptz, server time |
| viewer_id / viewer_email | who retrieved |
| viewer_is_admin | bool, so we can tell admin access from granted access |
| subject_type / subject_id / subject_name | member or guest, with the name as it was at the time |
| kind | `personal` · `emergency` · `id` · `signed_doc` · `id_renewal` |
| fields | which fields were shown (for example `["phone","address"]`) |
| reason / note | from the modal |
| via | `ui` · `api` · `self` |
| ip, ua, request_path | from the request |
| prev_hash / hash | `hash = sha256(prev_hash ‖ canonical row)` |

Also `pii_report_runs` (month, sent_at, chain_ok, row_count) so a month is never sent twice and a skipped month is visible.

## Enforcement

1. **Server-side only.** The values are never in the page HTML. They come from one endpoint, `POST /api/pii/retrieve`, which checks permission, validates the reason, writes the `pii_access` row, and only then returns the data. Hiding a field in the UI is not security.
2. One helper, `requirePii(kind, subject)`, wraps every existing PII read path: `lib/guests.ts`, the guest contacts, photo and PDF routes, `/api/members/id/image`, the CRM people pages, ID renewals, and signed-doc downloads. If a path can return PII without calling it, that is a bug. Add a test that fails when a new route reads PII columns without it.
3. The log write and the data read happen in one transaction. If the log write fails, no data is returned (fail closed).
4. Rate limit retrievals per viewer (reuse `hit()` in `lib/limit.ts`).
5. API keys cannot retrieve PII unless a key is explicitly given the same permission.
6. Admins are not exempt from the modal, the reason, or the log. They only skip the permission check.

## Audit PII page

Tabs:

1. **Access events**: filter by viewer, subject, kind, reason, date and IP. Export CSV (the export is itself logged).
2. **HTTP log correlation**: rows from `http_log` that hit PII routes (ID image, guest photo and PDF, contacts, CRM people), with IP, user agent and referrer. Each row is matched to a `pii_access` row within a short window and user. **Unmatched hits are flagged "no access record"**: a possible bypass or leak.
3. **By subject**: pick a person and see everyone who has ever viewed their data.
4. **Flags**: bulk viewing, off-hours access, access from a new IP, repeated views of the same person, viewing without a prior tour or ticket, and access by a permission that was just granted.
5. **Integrity**: result of the hash-chain check, with the first broken row if any.

Note: `http_log` is partitioned by day and pruned by `KEEP_ROWS`. Correlation only works while those partitions exist, so the nightly job copies the PII-route hits into `pii_access_http` (path, ip, ua, user, status, at) so the evidence outlives the HTTP log.

## Monthly report

- Runs hourly and sends once a month has ended in site time. Skips if no non-self access happened.
- Contents: period, total retrievals, a table of viewer × kind counts, subjects viewed (names), reasons breakdown, admin vs granted share, bulk-access flags raised, unmatched HTTP hits, hash-chain status, and a link to Audit PII.
- Contains **no** PII values (no phone, address, ID content).
- Record the send in `pii_report_runs`. If the send fails, retry daily and alert admins via ntfy.
- Manual **Send now / resend** button for full admins.

## Real-time alerts

- **Bulk access**: more than N retrievals by one person in an hour (start with 10, configurable). Push via ntfy and email to admins.
- **Gov ID retrieved by a non-admin**: immediate ntfy to admins.

## Admin UI changes

- `/admin/users/special`: add the four permissions with a short description each. Show "admins are always allowed".
- Granting or removing any of these perms writes to the normal audit log, and is listed in the monthly report.
- `lib/access.ts`: add an `audit-pii` page entry under the `admin` section.
- `lib/audit-areas.ts`: add a `pii.%` area.

## What else we should add (not yet decided)

These weren't in the original ask. Suggested, in priority order:

1. **Notify the subject.** A line in the member's inbox: "A board member viewed your emergency contacts on <date>." Builds trust, and members catch misuse. (Decided against in this round: not included by default. Revisit.)
2. **Break-glass access.** For a real emergency a non-permitted volunteer can get access with a mandatory reason, which pages the admins immediately.
3. **Time-boxed grants.** A special permission can have an expiry date (for example for an event volunteer), so access doesn't linger.
4. **Access reviews.** Each quarter, a prompt for admins to confirm everyone on the lists still needs access. Log the outcome.
5. **Watermarking.** Show the viewer's name and time faintly over revealed ID images, so a leaked screenshot points to its source.
6. **Screenshot/print friction.** Block right-click and printing of the revealed ID. It is only a deterrent, so don't rely on it.
7. **Masked-by-default exports.** CRM CSV exports leave PII columns out unless the exporter has the permission, and the export is logged.
8. **Search and logs hygiene.** Make sure PII never lands in `http_log` query strings, error logs, mail logs or AI prompts. `redact.ts` is the place to enforce this.
9. **Data subject requests.** Let a member request a report of who accessed their data, since the table can answer it.
10. **Offboarding.** Removing a member, volunteer or admin removes their special-permission rows and kills their sessions.
11. **Backups.** The `pii_access` table is included in backups, and its chain head hash is stored somewhere else (for example emailed in the monthly report) so a restored or rewritten DB can't quietly drop rows.
12. **Incident runbook.** One page for "we think a leak happened": where to look, how to freeze access (a global **Lock PII retrieval** switch for admins), who to tell, and Michigan breach-notification obligations.
13. **Privacy statement.** Update the privacy page to say who can see this data and that access is logged and reported to the board.

## Build order

1. `pii_access` table, hash chain, `requirePii` helper and the `/api/pii/retrieve` endpoint.
2. Modal and masked-field component. Convert the guest contacts, ID image and CRM pages.
3. Special permissions UI and `lib/access.ts` entry.
4. Audit PII page: access events, by subject, integrity.
5. HTTP log correlation and the `pii_access_http` copy job.
6. Monthly report, with a dry-run preview in the admin UI.
7. Alerts (bulk access, non-admin Gov ID).
8. Flags, and the "what else" items agreed on above.

Each step should ship as its own PR, and step 2 should convert one PII surface first (the ID page, which already has the lock behaviour) before the rest.

## Open questions

- Threshold N for the bulk-access alert, and whether the quiet-hours flag should use site time.
- Whether board members who aren't admins should get **Audit PII** by default.
- Whether to notify subjects (item 1 above).
- Who owns the incident runbook.
