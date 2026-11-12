# Business Rules Catalog

Every meaningful limit, restriction and decision rule found in the application. Back to the [Overview](BUSINESS_PROCESS_OVERVIEW.md). Workflows that use these rules are in [WORKFLOW_DIAGRAMS.md](WORKFLOW_DIAGRAMS.md).

**Confidence key:** ✅ Enforced by the server · 🔶 Inferred from several code paths · 🖥️ Interface only (not checked by the server) · ❔ Needs stakeholder decision. Paths are relative to `web/`.

> Numbers such as "5 per hour" are **current values in the code**. They are not configurable unless the table says so.

## A. Sign-in and accounts

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-A1 | Registration and sign-in are one step: an emailed one-time link verifies the address and starts a session. | ✅ | `lib/readers.ts` `requestLink`, `consumeLink` |
| BR-A2 | A sign-in link works **once** and lasts **30 minutes**. | ✅ | `requestLink` |
| BR-A3 | A session lasts **30 days**; changing/resetting a password signs out all other devices. | ✅ | `session`, `revoke` |
| BR-A4 | Known and unknown email addresses get the same response (nobody can discover who has an account). A new address with no name entered sends nothing. | ✅ | `requestLink` |
| BR-A5 | Spam brakes: 5 link requests per 10 min per network address; 60 sign-in emails per hour site-wide; 1 email per account per minute. | ✅ | `requestLink`, `lib/limit.ts` |
| BR-A6 | **Max 3 new accounts per hour** for the whole site (an administrator can reset the counter). | ✅ | `SIGNUPS_PER_HOUR`, `resetSignups` |
| BR-A7 | Password sign-in is optional; passwords need **10+ characters**; 5 failed tries per address from one network (or 50 from anyone) pauses password sign-in for 15 min; 20 attempts per 15 min per network. | ✅ | `passwordLogin`, `PW_MIN` |
| BR-A8 | A **disabled** account cannot sign in or use existing sessions; the person is told once by email and phone alert with the reason staff entered. | ✅ | `currentApplicant`, `tellDisabled` |
| BR-A9 | A person must be **verified** (clicked a link) to exist as far as the site is concerned; unverified accounts are not listed or approvable. | ✅ | `listApplicants`, `listUsers` |
| BR-A10 | Redirect targets after sign-in must be same-site paths. | ✅ | `safeNext` |
| BR-A11 | Administrators sign in with **Google**, only if their address is on the administrator allow-list; a whole domain can be allowed, but then Google must confirm the account truly belongs to that domain. | ✅ | `auth.ts` |
| BR-A12 | If no administrator allow-list is configured, the **first verified account** on a fresh site becomes the locked founding administrator. | ✅ | `consumeLink` |

## B. Approval

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-B1 | Every new verified account starts **Pending** and enters the staff queue. | ✅ | `applied` |
| BR-B2 | Valid states: Pending, Waiting (staff asked something), Rejected, Approved. Staff may move between any two (except out of Approved for anyone holding staff access). | ✅ | `STATES`, `move` |
| BR-B3 | **Approving requires** the staff member to confirm they checked the person's name and contact details, and the person must have a first name. | ✅ | `move` |
| BR-B4 | Only people with **CRM access** (or full administrators) can work the approval queue. | ✅ | `app/api/webmaster/crm/route.ts` |
| BR-B5 | Changes are first-come: if two staff act on the same applicant, the second is told to reload. | ✅ | `setState` |
| BR-B6 | Internal notes are never visible to the applicant. | ✅ | `detail(forApplicant)` |
| BR-B7 | Applicants may send at most **10 messages per hour**, and only while Pending/Waiting. | ✅ | `reply` |
| BR-B8 | Staff may activate a walk-up visitor instantly, but not if the person is disabled or was previously rejected; this needs CRM write access. | ✅ | `activateWalkup`, `app/api/webmaster/tours/route.ts` |
| BR-B9 | Rejected applicants are emailed the reason (if staff gave one). | ✅ | `move` |

## C. Onboarding and agreement

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-C1 | After approval the order is fixed: **waiver → handbook → photo ID → profile details**. The server refuses out-of-order or repeated steps. | ✅ | `lib/onboarding.ts` `advance`, `NEXT` |
| BR-C2 | Members-only features require **approved + onboarding complete**. Applicants only see their status page. | ✅ | `currentMember` |
| BR-C3 | Waiver needs typed full name (2+ characters), initials, and a drawn signature. | ✅ | `signWaiver` |
| BR-C4 | The signed waiver PDF is emailed to the member and to **contact@kzoomakers.org**, stored encrypted. | ✅ | `OFFICE`, `finalize` |
| BR-C5 | Accepted ID types: driver's licence/state ID, passport, military ID, college ID. Must **not be expired**; expiry date required except for college IDs. | ✅ | `checkId` |
| BR-C6 | The ID image is converted to a standard image (removing hidden metadata), stored **encrypted**, and every staff view is written to the audit log. | ✅ | `storeId`, `viewId` |
| BR-C7 | A complete profile = phone + address + **at least one emergency contact** (max 10; each needs name, valid phone, relationship from a fixed list). | ✅ | `STEP_SQL`, `saveContact` |
| BR-C8 | A person joins the **Members mailing list once**, when approved + waiver signed + ID uploaded + emergency contact present. Staff removal is not undone later. | ✅ | `joinMembersIfDone` |
| BR-C9 | Published agreement versions are **never edited or deleted**; changes require a new version. | ✅ | `lib/waiver.ts` (no update/delete path) |
| BR-C10 | A new version needs: a new revision number, something actually changed, and a plain-language summary. | ✅ | `publish` |
| BR-C11 | If a version is marked **mandatory**, every approved member must sign it before using members features; all approved, active members are emailed. | ✅ | `STEP_SQL`, `notifyMembers` |
| BR-C12 | Members can only download **their own** signed copies; staff with CRM or board access can download others. | ✅ | `myPdf`, `app/api/webmaster/member-file/route.ts` |
| BR-C13 | The handbook step is an acknowledgement only. | 🖥️ | `handbookRead` (no content or version check) |

## D. Staff access and account control

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-D1 | Staff access is set per **section** (webmaster, mail, blog, forms, CRM, board, tours, chores, admin) as **none / read / write**. | ✅ | `lib/guard.ts` |
| BR-D2 | `admin: write` ("full administrator") implies **write on every section**. Google allow-list administrators are full administrators. | ✅ | `levelOf`, `me` |
| BR-D3 | Staff with a **site account** only have their powers while their account is approved and onboarded (they use the same member sign-in). | 🔶 | `me()` falls back to `currentMember` |
| BR-D4 | You cannot change your own Admin access, disable yourself, or delete yourself. | ✅ | `setAccess`, `setDisabled`, `deleteUser` |
| BR-D5 | The **founding administrator** cannot be changed, disabled or deleted. | ✅ | `locked` checks |
| BR-D6 | Removing, disabling or deleting a full administrator is refused unless **more than 3** active full administrators (site accounts) would remain. | ✅ | `MIN_ADMINS` |
| BR-D7 | Anyone holding any staff access can have their email, password or account changed only by a **full administrator**. | ✅ | `mayTakeOver` |
| BR-D8 | Every user, access and approval change is recorded in the audit log with the actor. | ✅ | `logAudit` calls |
| BR-D9 | Requests for admin areas without permission return "not found" rather than "forbidden". | ✅ | e.g. `app/api/webmaster/crm/route.ts` |

## E. Tours

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-E1 | A block: tour length 5–480 min, 1–50 people per tour, at least one tour must fit. | ✅ | `saveBlock` |
| BR-E2 | Bookable window: from **4 hours from now** to **28 days** ahead. | ✅ | `MIN_ADVANCE_H`, `WINDOW_DAYS` |
| BR-E3 | Booking needs name, valid email, phone with 10 digits. | ✅ | `book` |
| BR-E4 | A slot cannot exceed its capacity; the same email cannot book the same slot twice. | ✅ | `book` (locked check) |
| BR-E5 | Spam brake: 5 bookings per hour per network, 40 per hour overall. Same for walk-up requests. | ✅ | `book`, `requestTour` |
| BR-E6 | Changing a block cannot remove a slot someone booked or push a slot below its booked count. | ✅ | `saveBlock` |
| BR-E7 | Deleting a block cancels all upcoming bookings in it and emails everyone affected; walk-up visitors return to the queue. | ✅ | `deleteBlocks` |
| BR-E8 | A visitor cancels using a secret link in their email; no account is needed. | ✅ | `cancelByToken` |
| BR-E9 | Outcome statuses: booked, no show, signed up, sign up later, maybe later, no interest. | ✅ | `STATUSES` |
| BR-E10 | Walk-up request needs first/last name, email, 10-digit phone, 5-digit zip. | ✅ | `requestTour` |
| BR-E11 | An offer needs at least one future date (≥4 h ahead) and the volunteer's email. | ✅ | `offerTimes`, `checkOffers` |
| BR-E12 | A picked walk-up date becomes a one-person block and booking; the request becomes Scheduled. | ✅ | `respond` |
| BR-E13 | "None of these work" returns the request to Open and counts as a reschedule. | ✅ | `respond` |
| BR-E14 | A Scheduled request cannot be dismissed or reopened. | ✅ | `setRequestStatus` |
| BR-E15 | Staff may email a visitor only if mail is set up; internal notes always work. | ✅ | `postStaff` |
| BR-E16 | Visitors may send max **10 messages per hour** per conversation. | ✅ | `postVisitor` |
| BR-E17 | Cancelled bookings cannot have their outcome changed. | ✅ | `setStatus` |
| BR-E18 | Four notifiable events: booked, walk-up created, walk-up taken, walk-up untaken. Up to 50 email addresses each. | ✅ | `lib/tours-notify.ts` |
| BR-E19 | An untaken walk-up is flagged once, after a configurable number of days (default 3; setting 0 disables). | ✅ | `checkStale` |
| BR-E20 | A failed notification never prevents a booking or other action. | ✅ | `announce`, `notify` |

## F. Classes

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-F1 | Only approved, onboarded members see and sign up for classes. | ✅ | `app/members/classes/page.tsx` |
| BR-F2 | Capacity 0 = unlimited. Otherwise the earliest sign-ups (by time) are confirmed; others are waitlisted and move up automatically on cancellation. | ✅ | `CLASS_COLS` |
| BR-F3 | Sign-up is refused for cancelled or already-started classes. | ✅ | `signUp` |
| BR-F4 | Upcoming list includes classes that began less than 2 hours ago. | ✅ | `upcomingClasses` |
| BR-F5 | A member's proposed class must be **at least 45 days** in the future; staff may raise (not lower) this minimum, up to 365 days. | ✅ | `MIN_CLASS_DAYS`, `noticeDays` |
| BR-F6 | Proposal description must be at least 40 characters; title required. | ✅ | `proposeClass` |
| BR-F7 | A member may have at most **3 pending** proposals. | ✅ | `proposeClass` |
| BR-F8 | Declining a proposal **requires a reason**. | ✅ | `decideProposal` |
| BR-F9 | If staff choose to announce an approved class, email must be set up or nothing is approved. | ✅ | `decideProposal` |

## G. Memberships and tools

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-G1 | New membership levels must be a plan currently on the Pricing page. | ✅ | `setMemberships` |
| BR-G2 | Memberships have a start date but **no end, renewal or payment state**. | ✅ | `memberships` table |
| BR-G3 | Tool authorizations carry optional expiry and note; expired ones are marked but **not otherwise acted on**. | 🔶 | `authsFor`, `app/members/page.tsx` |

## H. Volunteer chores

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-H1 | A chore needs a name; frequency 1–366 days or blank for "as needed". | ✅ | `saveChore` |
| BR-H2 | Due date = last completion (or, if never done, the date the chore was created) + frequency; "as needed" chores are never due; snoozing pushes the due date out 1–366 days. | ✅ | `dueAt` in `lib/chores-calc.ts` |
| BR-H3 | Only approved, active members can have time logged. | ✅ | `memberById` |
| BR-H4 | One open shift per member per chore. | ✅ | `startShift` |
| BR-H5 | A shift open over **12 hours** must be closed with an explicit number of minutes; no logged stretch may exceed **16 hours**, or be dated in the future. | ✅ | `MAX_SHIFT_H`, `MAX_LOG_H` |
| BR-H6 | Members finish only their own shifts; the outside system may act for any member. | ✅ | `app/api/members/makerfavor/route.ts`, `app/api/makerfavor/route.ts` |
| BR-H7 | Retired chores keep their history. Outside-system keys have scopes (read, write) and optional expiry; the key is shown once and only a fingerprint is kept. | ✅ | `deleteChore`, `lib/api-keys.ts` |

## I. Communications

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-I1 | Contact message: 10–3000 characters, valid email; 5 per hour per network, 30 per hour overall. | ✅ | `submitContact` |
| BR-I2 | Messages with duplicates (1 day), Cyrillic, 4+ links, blocked words, or repeated characters are **held**, but the sender is told they succeeded. | ✅ | `lib/spam.ts` |
| BR-I3 | A message that fails to email is held (not lost). | ✅ | `submitContact` |
| BR-I4 | Subscribe forms use a hidden decoy field and a limit of 5 tries per 10 min per network. | ✅ | `app/api/subscribe/route.ts`, `publicSubscribe` |
| BR-I5 | With double opt-in on, people stay unconfirmed until they click; consent time, source and address are recorded. | ✅ | `publicSubscribe` |
| BR-I6 | Bounced or spam-complaint addresses can never be re-subscribed by links or forms. | ✅ | `tokenAction`, `handleWebhook` |
| BR-I7 | A campaign needs subject, at least one list, content, and at least one recipient; scheduled sends must be 1+ minute ahead. | ✅ | `sendCampaign` |
| BR-I8 | Failed emails are retried at 2, 4, 8 … minutes (max 6 h) up to **8** tries. | ✅ | `lib/rules.ts` |
| BR-I9 | Handbook updates go only to people who **opted in**; sending is claimed once so a double click cannot send twice. | ✅ | `lib/handbook.ts` `send` |
| BR-I10 | Member-to-member messages: both parties must be in the directory; first contact limited to 2/day per recipient and 5/hour; replies 30/day and 30/hour; 5–2000 characters. | ✅ | `messageMember` |
| BR-I11 | Staff can erase a mailing-list person and export everything held about them (privacy requests). | ✅ | `exportPerson`, `erasePerson` |

## J. Governance documents

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-J1 | Roles: signer and approver must act; viewer confirms reading; cc receives a copy. At least one signer/approver required; max 50 people; each email once. | ✅ | `cleanSetup` |
| BR-J2 | On a PDF, every signer/approver needs a signature field placed. | ✅ | `cleanSetup` |
| BR-J3 | PDFs: real PDF, ≤ 8 MB, ≤ 200 pages. | ✅ | `pdfInfo` |
| BR-J4 | A paper completes when all signers/approvers have signed, or the chosen "needed" number have. | ✅ | `recordSignature` |
| BR-J5 | Signing in order: the next group is emailed only after the previous group finishes. | ✅ | `advance` |
| BR-J6 | Personal links are single-person; re-sending issues a new link and retires the old; password/code protection locks after 10 wrong tries. | ✅ | `newLink`, `unlock` |
| BR-J7 | Overdue open papers become Expired when next viewed/listed; extending the date reopens them. | ✅ | `listDocs`, `setDue` |
| BR-J8 | Only open papers can be reminded or voided; completed papers are final and encrypted. | ✅ | `remind`, `voidDoc` |
| BR-J9 | Remembered signer contacts are suggested for 6 months after last use. | ✅ | `recentContacts` |

## K. Blog, reviews and website

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-K1 | A post is public when published and its scheduled time has passed. | ✅ | `LIVE` in `lib/blog.ts` |
| BR-K2 | Commenting needs a verified, non-rejected account; 1–2000 characters; 1 per 10 s per person, 5 per 10 min per network; can only reply to approved comments. | ✅ | `addComment` |
| BR-K3 | Moderation mode (none / first-time / all) plus content rules decide approved, held or spam; admins can close comments after N days (0 = never). | ✅ | `judge`, `Settings` |
| BR-K4 | Deleting a comment deletes its replies; hidden/spam comments with visible replies show as "removed". | ✅ | `deleteComment`, `listThread` |
| BR-K5 | Each blog save keeps a snapshot; any can be restored. | ✅ | `postHistory`, `revertPost` |
| BR-K6 | Reviews: 10–800 characters; one waiting at a time; 3 per day; spam stored as rejected. | ✅ | `submitReview` |
| BR-K7 | An approved review is added to the homepage once. | ✅ | `decideReview` |
| BR-K8 | Saving identical content is ignored; every real save is recorded with who/when. | ✅ | `savePage`, `logAudit` |
| BR-K9 | Locked core pages cannot be created, deleted, or overwritten through the page API. | ✅ | `LOCKED` |
| BR-K10 | Financial PDFs: 1990–2100 year, ≤ 10 MB, must be a PDF; replacing keeps the original upload date. | ✅ | `lib/financials.ts` |
| BR-K11 | The "Financials" menu link appears only after a PDF exists. | ✅ | `getPublicMenu` |
| BR-K12 | Uploaded images are shrunk (avatars to 240 px squares, others to 2000 px wide); size limits are lower for anonymous than for signed-in users. | ✅ | `lib/image.ts`, `middleware.ts` |
| BR-K13 | External-link clicks are counted only for http/https links leaving the site; the redirect endpoint goes only to a short list of approved destinations. | ✅ | `lib/links.ts` |

## L. Operations and retention

| ID | Rule | Conf. | Evidence |
| --- | --- | --- | --- |
| BR-L1 | Rows older than **5 years** are deleted from: audit log, page revisions, tour timeline, email clicks, contact messages, notifications; sent campaigns older than 5 years are deleted with their recipient rows. | ✅ | `lib/retention.ts` |
| BR-L2 | Link-click details are kept 180 days; daily totals forever. | ✅ | `DETAIL_DAYS` |
| BR-L3 | Phone-alert messages in personal topics unread for 60 days are dropped; shared topics follow their own retention (max 120 days). | ✅ | `UNREAD_DAYS`, `MAX_RETENTION` |
| BR-L4 | Request bodies larger than the configured public size are rejected before reading (default set by admin). | ✅ | `middleware.ts` |
| BR-L5 | Mail-delivery jobs and timers run on one machine at a time so nothing is sent twice. | ✅ | `withLock` in `instrumentation.ts` |

## Rules implied by wording but **not** enforced

| Statement | Where it appears | Reality |
| --- | --- | --- |
| "You need to review and sign the new version before you can keep using the members area." | Agreement update email | ✅ **is** enforced (BR-C11). |
| "Tool sign-offs happen after an orientation or class at the space." | Member home page | 🖥️ Not enforced: staff grant sign-offs freely; there is no link to class attendance. |
| "Ask at the space about a refresher" (expired sign-off) | Member home page | 🖥️ Nothing restricts the person; expiry is advisory. |
| "First come, first served" seats | Class announcement email | ✅ Matches sign-up order. |
| "Please cancel so someone else can have the spot" | Tour confirmation | 🖥️ Request only; no penalty or limit on no-shows. |

## Policies that need stakeholder clarification

See [PROCESS_GAPS.md](PROCESS_GAPS.md): payment and renewal (G-01, G-02), response time for applicants (G-03), retention of personal records (G-08), what an administrator quorum means (G-09), reminder emails to visitors (G-13), tool sign-off enforcement (G-14).
