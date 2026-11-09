# Process Gaps and Issues

Missing, contradictory, incomplete or ambiguous processes. Back to the [Overview](BUSINESS_PROCESS_OVERVIEW.md). Each item states the evidence, business impact and a practical recommendation. Nothing here was invented: where something is a conclusion rather than a fact, it is marked 🔶. Paths are relative to `web/`.

**Priority:** 🔴 high (affects people, money or legal exposure) · 🟠 medium · 🟡 low

## Summary

| ID | Priority | Gap |
| --- | :-: | --- |
| [G-01](#g-01) | 🔴 | No dues, invoicing or payment process |
| [G-02](#g-02) | 🔴 | Membership never expires, renews or lapses; no way for a member to leave |
| [G-03](#g-03) | 🔴 | No reminder or target time for stuck applicants |
| [G-04](#g-04) | 🟠 | Genuine contact messages wrongly held get no feedback |
| [G-05](#g-05) | 🟠 | Waitlisted attendees are not told they moved up |
| [G-06](#g-06) | 🟠 | Class cancellations/changes are not announced |
| [G-07](#g-07) | 🟠 | Declined board signature does not alert the requester |
| [G-08](#g-08) | 🔴 | Retention of personal records (IDs, agreements, approval threads) undefined |
| [G-09](#g-09) | 🟠 | "At least 3 administrators" ignores Google administrators 🔶 |
| [G-10](#g-10) | 🟠 | Site-wide cap of 3 new accounts per hour |
| [G-11](#g-11) | 🟡 | Agreement-update emails can be lost on restart 🔶 |
| [G-12](#g-12) | 🟡 | Walk-up requests can bounce back without limit |
| [G-13](#g-13) | 🟠 | No reminder emails to tour visitors or guides |
| [G-14](#g-14) | 🟠 | Tool sign-offs expire on paper only |
| [G-15](#g-15) | 🟡 | Volunteer hours have no verification step |
| [G-16](#g-16) | 🟡 | Handbook changes are not tied to re-acknowledgement |
| [G-18](#g-18) | 🟠 | No second-person check on sensitive staff actions |
| [G-19](#g-19) | 🟡 | "Signed up" tour outcome is not linked to an account |
| [G-20](#g-20) | 🟡 | Two sign-in systems for staff |
| [G-21](#g-21) | 🟡 | Manual, undocumented steps the system depends on |

---

<a id="g-01"></a>
## G-01 🔴 No dues, invoicing or payment process

**Evidence:** No payment, invoice, refund or billing code exists. The only trace is a free-text QuickBooks ID on a person (`lib/profiles.ts` `ADMIN_FIELDS`), a free-text class `price`, and membership "levels" (`lib/crm.ts`). The public Pricing page lists plans, but no flow ties a person to paying for one.
**Impact:** Whether a member has paid is invisible to the system; staff cannot see who is current. Class fees are collected (if at all) elsewhere.
**Recommendation:** Decide and document where dues are collected and how staff learn of non-payment. Consider adding a "paid through" date to memberships even if payment stays external.

<a id="g-02"></a>
## G-02 🔴 Membership never expires, renews or lapses; no exit path

**Evidence:** `memberships` stores only `level` and `since` (`lib/db.ts`, `lib/crm.ts`). Nothing changes when time passes. Members have no "leave" action (`app/api/account/route.ts` supports edit and contacts only). Staff can only disable or delete (`lib/profiles.ts`).
**Impact:** Former members keep full access until a human remembers to disable them. Deleting an account is irreversible and destroys history; disabling shows a "disabled" message that was not designed for resignations.
**Recommendation:** Define states such as *active / lapsed / resigned*, and who changes them. Add a resign action and a "lapsed" access rule if desired.

<a id="g-03"></a>
## G-03 🔴 No reminder or target time for stuck applicants

**Evidence:** Staff are notified once when an applicant arrives or replies (`lib/approvals.ts` `tellStaff`). The only stale-item timer in the system covers walk-up tours (`lib/tours.ts` `checkStale`, `instrumentation.ts`). Applicants who are Pending with no reply are never escalated; applicants in Waiting are not nudged either.
**Impact:** A person can wait indefinitely with no feedback. Staff turnover or a missed notification silently drops them.
**Recommendation:** Add a "pending longer than N days" alert (reuse the walk-up reminder pattern) and an automatic acknowledgement email to the applicant stating what to expect. The admin pop-up that counts pending applicants exists (`alertSummary`) but only shows when someone is looking.

<a id="g-04"></a>
## G-04 🟠 Genuine contact messages wrongly held get no feedback

**Evidence:** `lib/contact.ts` deliberately shows success for held messages. No alert is sent to the visitor; held messages wait for an admin (a pop-up counts them: `heldSummary`).
**Impact:** A real person using a link or capital letters may never get an answer and never know.
**Recommendation:** Add a daily digest to forms staff of held messages, and review the "four links" and "Cyrillic" rules for local needs.

<a id="g-05"></a>
## G-05 🟠 Waitlisted attendees are not told they moved up

**Evidence:** `cancelSignUp` just deletes the row (`lib/crm.ts`). Confirmed vs. waitlist is calculated on display.
**Impact:** A person on the waitlist who is promoted may not attend because they do not know, leaving an empty seat.
**Recommendation:** When a cancellation promotes someone, send an in-app notification and email (the notification tool already exists: `notifyUser`).

<a id="g-06"></a>
## G-06 🟠 Class cancellations and changes are not announced

**Evidence:** `saveClass` can set `cancelled` or change date/location without notifying anyone (`lib/crm.ts`). Only *new* classes are announced, and only when staff tick a box on approval.
**Impact:** Signed-up members may arrive for a cancelled or moved class.
**Recommendation:** On cancel or on change of time/location, notify everyone signed up.

<a id="g-07"></a>
## G-07 🟠 Declined board signature does not alert the requester

**Evidence:** `declineByToken` records the decline and reason but sends no email and does not change the paper's status (`lib/sign.ts`). The paper stays Open.
**Impact:** A paper can sit open until its due date although a signer has refused; the creator learns only by looking.
**Recommendation:** Email the creator on decline and show a "declined" state in the list.

<a id="g-08"></a>
## G-08 🔴 Retention of personal records is undefined

**Evidence:** The cleanup list covers only audit, page history, tour timeline, email clicks, contact messages, notifications and sent campaigns (`lib/retention.ts`). It does **not** cover member records, photo ID images, signed agreements, approval threads, emergency contacts, class and chore data, or tour bookings (names, emails, phones, device details). Deleting an account removes the ID image but keeps signed agreements (`lib/db.ts`).
**Impact:** Sensitive documents (government IDs) are held for as long as the account exists, including for people who left years ago. Tour visitors who never join remain on file indefinitely.
**Recommendation:** Set written retention periods (e.g., ID image removed N months after leaving; tour records after N years) and extend the cleanup. Ask counsel what must be kept for signed waivers.

<a id="g-09"></a>
## G-09 🟠 "At least 3 administrators" ignores Google administrators 🔶

**Evidence:** The rule counts rows of the `admin` section among **site accounts** (`lib/users.ts` `setAccess`, `lib/profiles.ts`). People on the Google allow-list (`auth.ts`) are not in that table. Removal is allowed only when the count is **greater than** 3, so with fewer than four site-account administrators nobody can be demoted.
**Impact:** The safeguard may either block legitimate changes or give false comfort. This is inferred from the code and should be confirmed against how many administrators exist in the live system.
**Recommendation:** Decide whether "3" is meant to include Google administrators and make the message say who is counted.

<a id="g-10"></a>
## G-10 🟠 Site-wide cap of three new accounts per hour

**Evidence:** `SIGNUPS_PER_HOUR = 3` (`lib/readers.ts`); admins can reset it.
**Impact:** During an open house or class night, the fourth sign-up gets "We're getting a lot of sign-ups" and may not return.
**Recommendation:** Raise the number, make it configurable, or document the reset in the event checklist.

<a id="g-11"></a>
## G-11 🟡 Agreement-update emails can be lost on restart 🔶

**Evidence:** `notifyMembers` is started in the background and loops with a 0.2 s pause (`lib/waiver.ts`); it is not stored as a job. Mail itself retries, but the loop does not resume.
**Impact:** After a restart mid-send, some members are not emailed (they are still blocked at sign-in until they sign).
**Recommendation:** Queue the announcement as a campaign (the handbook announcement already does this).

<a id="g-12"></a>
## G-12 🟡 Walk-up requests can bounce back without limit

**Evidence:** `respond` increments a counter each time a visitor declines; no cap exists (`lib/tours.ts`).
**Impact:** Staff time is consumed with no escalation rule.
**Recommendation:** After N declines, notify a lead or close with a message.

<a id="g-13"></a>
## G-13 🟠 No reminder emails to tour visitors or guides

**Evidence:** `checkReminders` writes only to the internal timeline (`lib/tours.ts`). Emails are sent at booking, cancel, and message time only.
**Impact:** No-shows may be higher than necessary; guides depend on their own calendars.
**Recommendation:** Send a reminder email (e.g., 24 h and 2 h) with the cancel link. The tour statistics page can then measure the effect.

<a id="g-14"></a>
## G-14 🟠 Tool sign-offs expire on paper only

**Evidence:** `expires_on` is shown and flagged on the member home page (`app/members/page.tsx`); nothing blocks, alerts staff or notifies the member beforehand.
**Impact:** A safety control (who may use which machine) relies on staff memory. 🔶 The system may not be the intended enforcement point (the machines are physical); this needs stakeholder clarification.
**Recommendation:** At minimum notify members and staff 30 days before expiry, and show a "sign-offs expiring" list in the CRM.

<a id="g-15"></a>
## G-15 🟡 Volunteer hours have no verification step

**Evidence:** Members and the outside system can log time directly (`lib/chores.ts`); only staff deletion corrects entries. All actions are audited.
**Impact:** Hours may feed recognition or benefits (if used that way) without review. 🔶 Whether hours earn rewards is not defined in the code.
**Recommendation:** If hours matter, add a periodic review or a confirm step for long entries.

<a id="g-16"></a>
## G-16 🟡 Handbook changes are not tied to acknowledgement

**Evidence:** The onboarding handbook step is a checkbox with no version recorded (`lib/onboarding.ts` `handbookRead`). Changes are optional announcements to opt-in subscribers (`lib/handbook.ts`).
**Impact:** The organization cannot show who has read which handbook version, unlike the agreement.
**Recommendation:** Record the version at acknowledgement, and decide whether material changes need re-acknowledgement.

<a id="g-18"></a>
## G-18 🟠 No second-person check on sensitive staff actions

**Evidence:** A single CRM-write user can approve members, grant tool sign-offs, publish a mandatory agreement, and view IDs (`app/api/webmaster/crm/route.ts`, `waiver/route.ts`). Views of IDs and all changes are audited, which allows after-the-fact review only.
**Impact:** Errors or misuse are caught only if someone reads the audit log.
**Recommendation:** Require a second approver for publishing a mandatory agreement, and send a weekly digest of ID views.

<a id="g-19"></a>
## G-19 🟡 "Signed up" tour outcome is not linked to an account

**Evidence:** `setStatus` changes a label only (`lib/tours.ts`); the visitor has no account link.
**Impact:** Conversion statistics depend on staff recording the outcome by hand and may not match actual approved members.
**Recommendation:** Match tour emails to accounts and show the real result in statistics.

<a id="g-20"></a>
## G-20 🟡 Two sign-in systems for staff

**Evidence:** Google sign-in for the allow-list (`auth.ts`); emailed link/password for everyone else (`lib/readers.ts`); admin pages accept either (`lib/guard.ts`). Site-account staff must be fully onboarded to act 🔶.
**Impact:** Staff and trainers must know which login to use; new staff are blocked until onboarding is finished.
**Recommendation:** Document the two paths on the admin login page and in staff onboarding.

<a id="g-21"></a>
## G-21 🟡 Manual, undocumented steps the system depends on

Things the code assumes a human does, with no tool support or checklist:

| Step | Why it matters |
| --- | --- |
| Configure the administrator allow-list in the host's settings | Without it the first verified account becomes admin ([BR-A12](BUSINESS_RULES.md#a-sign-in-and-accounts)) |
| Save a default sender and email key in the mail Settings | Sign-in, approvals, tours and most workflows refuse to work without it |
| Keep the Pricing page plans up to date | Membership levels can only be chosen from them |
| Upload a signing certificate (optional) | Without one, signed PDFs are not digitally sealed |
| Check the held contact-form queue | Held messages are otherwise never delivered |
| Publish tour availability ahead of time | Otherwise visitors see no times (only walk-up requests) |
| Record tour outcomes | Statistics rely on it |
| Run payment and renewal outside the system | See G-01, G-02 |

**Recommendation:** Create a short staff checklist and an "admin health" screen listing each setting and whether it is set.

---

## Coverage limitation

Numbered G-17 was reserved during analysis and withdrawn after the code showed the "locked pages" behavior is intentional (documented in the README). Items marked 🔶 should be confirmed with people who run the system day to day. Screens were sampled rather than read in full, so purely visual dead ends (for example a confusing button label) are not covered.
