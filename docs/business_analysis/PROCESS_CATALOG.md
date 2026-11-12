# Process Catalog

An index of every business process found in the application. Back to the [Overview](BUSINESS_PROCESS_OVERVIEW.md). Detailed step-by-step workflows (with diagrams) are in [WORKFLOW_DIAGRAMS.md](WORKFLOW_DIAGRAMS.md); the workflow ID in the last column links to it.

**Terms used**

| Term | Meaning |
| --- | --- |
| **Account** | A person's login record on the site. Created by entering a name and email. |
| **Applicant** | An account that has verified its email but is not yet approved. |
| **Member** | An approved account that has finished the welcome steps. |
| **Onboarding** | The ordered steps after approval: waiver → handbook → photo ID → profile details. |
| **Walk-up request** | A tour request made when no tour times were open. A volunteer later offers dates. |
| **Block** | A window of time a tour guide publishes, divided into equal tour slots. |
| **Campaign** | One email sent to a mailing list. |
| **Section** | One of nine admin areas that staff access is granted for. |
| **Audit log** | The permanent record of who changed what and when. |

## Catalog

| ID | Process | Purpose | Participants | Triggered by | Related | Workflow |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | **Registration & sign-in (passwordless)** | Let anyone create an account and sign in without remembering a password | Visitor, system | Visitor enters name/email | P-02, P-03 | [W-01](WORKFLOW_DIAGRAMS.md#w-01-registration-and-sign-in) |
| P-02 | **Membership application approval** | Staff vet each new person before they get member access | Applicant, CRM staff | Applicant verifies email | P-01, P-04, P-13 | [W-02](WORKFLOW_DIAGRAMS.md#w-02-membership-application-approval) |
| P-03 | **Account recovery & password management** | Regain access; optionally use a password | Member, administrator | Member asks for link; admin sends reset | P-01 | [W-03](WORKFLOW_DIAGRAMS.md#w-03-account-recovery-and-passwords) |
| P-04 | **Member onboarding** | Collect waiver, handbook acknowledgement, photo ID, contact info and emergency contact | Approved member, system | Approval | P-02, P-05 | [W-04](WORKFLOW_DIAGRAMS.md#w-04-member-onboarding) |
| P-05 | **Membership agreement versions & re-signing** | Keep the liability agreement current and make everyone re-sign when it matters | CRM staff, all members | Staff publish a new version | P-04 | [W-05](WORKFLOW_DIAGRAMS.md#w-05-membership-agreement-versions-and-re-signing) |
| P-06 | **Account administration (disable, delete, access)** | Suspend or remove accounts; grant staff powers safely | Administrators, CRM staff | Staff action | P-02 | [W-06](WORKFLOW_DIAGRAMS.md#w-06-account-suspension-deletion-and-staff-access) |
| P-07 | **Tour booking** | Let visitors book a scheduled tour | Visitor, guide, tours staff | Visitor picks an open slot | P-08, P-10 | [W-07](WORKFLOW_DIAGRAMS.md#w-07-tour-booking-and-availability) |
| P-08 | **Walk-up tour request** | Serve visitors when no times are open | Visitor, volunteer guide, tours staff | Visitor requests a tour | P-07, P-02 | [W-08](WORKFLOW_DIAGRAMS.md#w-08-walk-up-tour-request) |
| P-09 | **Tour follow-up & conversation** | Track the outcome of tours and talk with visitors | Tours staff, visitor | Tour booked/requested | P-07, P-08 | [W-09](WORKFLOW_DIAGRAMS.md#w-09-tour-conversation-and-outcome-tracking) |
| P-10 | **Tour notifications & reminders** | Tell the right people when tours happen or stall | System, tours staff | Tour events; timers | P-07, P-08 | [W-10](WORKFLOW_DIAGRAMS.md#w-10-tour-notifications-and-reminders) |
| P-11 | **Class scheduling** | Publish classes members can attend | CRM staff | Staff create a class | P-12 | [W-11](WORKFLOW_DIAGRAMS.md#w-11-class-scheduling-and-sign-up) |
| P-12 | **Class proposal & approval** | Let members teach, with staff approval | Member, CRM staff | Member submits a proposal | P-11 | [W-12](WORKFLOW_DIAGRAMS.md#w-12-class-proposal-and-approval) |
| P-13 | **Membership levels & tool sign-offs** | Record what plan a person holds and which tools they may use | CRM staff, member | Staff update the member | P-02 | [W-13](WORKFLOW_DIAGRAMS.md#w-13-membership-levels-and-tool-sign-offs) |
| P-14 | **Member directory & messaging** | Let members find each other by skill and write privately | Member | Member opts in; sends message | P-15 | [W-14](WORKFLOW_DIAGRAMS.md#w-14-member-directory-and-messaging) |
| P-15 | **Notifications (in-app & phone push)** | Deliver alerts to people | System, member, staff | Many events | P-10 | [W-10](WORKFLOW_DIAGRAMS.md#w-10-tour-notifications-and-reminders) |
| P-16 | **Volunteer chores** | Track recurring upkeep tasks and the hours volunteers give | Member, CRM/chores staff, outside system | Member starts/logs time; API call | – | [W-15](WORKFLOW_DIAGRAMS.md#w-15-volunteer-chores-and-time-tracking) |
| P-17 | **Contact forms with spam holding** | Receive public messages without spam | Visitor, administrators | Visitor submits | – | [W-16](WORKFLOW_DIAGRAMS.md#w-16-contact-form-and-spam-holding) |
| P-18 | **Newsletter subscription & campaigns** | Build mailing lists and send email | Subscriber, mail staff | Signup form; staff compose | P-19 | [W-17](WORKFLOW_DIAGRAMS.md#w-17-newsletter-subscription-and-campaigns) |
| P-19 | **Handbook change announcement** | Tell opted-in members when the handbook changes | Webmaster staff, subscribers | Handbook saved | P-18 | [W-18](WORKFLOW_DIAGRAMS.md#w-18-handbook-change-announcement) |
| P-20 | **Board document e-signing** | Collect legally traceable signatures on board papers | Board-papers staff, signers | Staff create a paper | – | [W-19](WORKFLOW_DIAGRAMS.md#w-19-board-document-e-signing) |
| P-21 | **Blog publishing & comments** | Publish posts; moderate reader comments | Blog staff, reader, system | Staff publish; reader comments | P-01 | [W-20](WORKFLOW_DIAGRAMS.md#w-20-blog-publishing-and-comment-moderation) |
| P-22 | **Member reviews to homepage** | Showcase approved testimonials | Member, webmaster staff | Member submits review | – | [W-21](WORKFLOW_DIAGRAMS.md#w-21-member-review-to-homepage) |
| P-23 | **Website content editing & history** | Edit public pages with undo | Webmaster staff | Staff edit | – | [W-22](WORKFLOW_DIAGRAMS.md#w-22-website-content-editing-history-and-undo) |
| P-24 | **Public financial reports** | Publish yearly financial PDFs | Webmaster staff, public | Staff upload | – | [W-22](WORKFLOW_DIAGRAMS.md#w-22-website-content-editing-history-and-undo) |
| P-25 | **Operational monitoring & retention** | Watch the system and delete old data | Administrators, system | Timers; admin screens | – | [W-23](WORKFLOW_DIAGRAMS.md#w-23-monitoring-and-data-retention) |

### Processes you might expect but that **do not exist** in the application

These are stated plainly so nobody assumes they are handled by the software. See [PROCESS_GAPS.md](PROCESS_GAPS.md).

| Expected process | Finding |
| --- | --- |
| Dues collection, invoices, refunds, payment failure handling | **Not implemented.** No payment code anywhere; only a free-text QuickBooks ID on the person record (`lib/profiles.ts`, `ADMIN_FIELDS`) |
| Membership renewal, expiry, lapse | **Not implemented.** A membership level has a start date only (`memberships.since`) |
| Membership cancellation / resignation by the member | **Not implemented.** Members cannot close their own account (no such action in `app/api/account/route.ts`); staff can disable or delete |
| Class payment or refund | **Not implemented.** Class price is display text |
| Tool-access enforcement | Sign-offs and expiry dates are *recorded and displayed*; nothing blocks or alerts when one expires |
| Appeals | No formal appeal; a rejected person's application is "closed" to replies (`lib/approvals.ts` `reply`), though staff can move them back |

### Dependencies on outside services

| Service | Used for | Where |
| --- | --- | --- |
| Google sign-in | Administrator login (allow-list) | `auth.ts` |
| SMTP2GO (or plain SMTP) | All outgoing email; bounce/spam webhooks | `lib/mail.ts` |
| S3-compatible storage | Uploaded images (photos, class art, blog images) | `lib/s3.ts` |
| PostgreSQL | All records | `lib/db.ts` |
| Google Calendar feed | Public calendar page | `lib/calendar-feed.ts` |
| AI model provider (configurable) | Draft summaries of handbook/agreement changes; email and blog drafting help | `lib/ai.ts` |
| ntfy.sh (optional) | Relaying iPhone push alerts | `lib/ntfy.ts` |
| "YAMNet" volunteer system | Reads/writes chores through scoped API keys | `app/api/makerfavor/route.ts` |
