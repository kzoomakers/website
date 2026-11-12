# Guest Flow: Business Requirements (DRAFT FOR REVIEW)

Status: draft, nothing built yet. Source: product owner's request, restated and organized. Items marked **[?]** are open questions or assumptions to confirm before build.

## 1. Purpose

Let a member bring guests to the space, with each guest's identity, emergency contacts and signed guest agreement on file **before** they can be checked in. Members manage their own guests. Every check-in is logged.

## 2. Actors

| Actor | Role |
|---|---|
| Member | Registers guests, completes their paperwork, checks them in, sees the log |
| Guest | Person brought by a member. No account of their own **[?]** |
| Admin | Writes and publishes agreement versions (guest and member), sees guest records **[?]** |

## 3. Scope

**In scope**
1. "I brought a Guest" card on the `/members` home page.
2. Guest list modal (list, check in, add, resume).
3. New Guest wizard: start (QR handoff), details, emergency contacts, guest agreement, photo ID.
4. Incomplete-guest handling (save partial progress, resume).
5. Guest check-in and a check-in log visible to the member.
6. Versioned guest agreement with drafts, preview, publish, and guest notification on a new revision.
7. Drafts for the existing **member** agreement (same mechanism).
8. Guest photo ID, shown beside the guest's name at check-in.
9. Guest deletion with a 2-year retention rule, and guest consent to that retention.

**Out of scope (for now)**: guest accounts or logins, payment, guest check-out, limits on guest visits **[?]**.

## 4. User stories and requirements

### 4.1 Entry point: home card
- **G-1** A card reading **"I brought a Guest"** (two lines: "I brought" / "a Guest") appears on `/members` home, in the card row **immediately to the left of** the "No classes yet" / next-class card (i.e. first in the row).
- **G-2** Clicking the card opens the Guest modal.

### 4.2 Guest modal (list)
- **G-3** On desktop the modal has a **left column listing the member's guests**. If the member has none, it shows **"You have nobody."**
- **G-4** On mobile the modal is **full screen**.
- **G-5** A member may have **unlimited guests**.
- **G-6** A **"New Guest"** action starts the wizard (4.3).
- **G-7** Each guest row shows name and status: **Ready** (all steps done) or **INCOMPLETE** (label shown next to the name).
- **G-8** Clicking a **Ready** guest offers **Check in** (4.5). Clicking an **INCOMPLETE** guest **resumes the wizard** at the first unfinished step.
- **G-9** A guest **cannot be checked in** unless every wizard step is complete.
- **G-10** Selecting a guest shows a right-hand pane (on mobile, a full-screen detail view with a Back button) containing: the guest's **photo ID picture beside their name** (neat, consistent size, so the member can see it is the right person), a **Check in** button, and the guest's **previous check-ins** (date/time, newest first). An INCOMPLETE guest shows the resume action instead of Check in.
- **G-10a** Each guest row also shows the small photo once one exists.
- **G-10b** A **Delete** action on the guest detail follows the rules in 4.6.

### 4.3 New Guest wizard
Look, feel and behaviour must match the existing member onboarding wizard (`web/app/members/wizard.tsx`). No new visual style. It must work equally well on **phones** (full screen, single column, large tap targets, native camera/keyboard types such as tel and email) and **desktops** (modal). Order: Start, Details, Emergency contacts, Agreement, Photo ID (last).

**Step 0 (first screen): Who fills this in?**
Text: **"Want the guest to complete this? Have them scan this QR code, otherwise click Next below to do it here:"**, followed by a **QR code** and a **Next** button.
- Scanning the QR opens the same wizard on the **guest's own phone**, tied to this guest record, so the guest enters their own details, contacts, signature and photo. No login; access is by a **unguessable, expiring link** (the QR encodes it) **[?]** expiry, e.g. 24 hours.
- The member and guest can work on the same guest record from either device; progress is saved per step (see G-11, G-12), so whoever continues sees where it left off.
- Clicking **Next** continues on the current device.
- On a phone the QR is of little use, so on small screens also offer a "Send link to guest" option (text/email) **[?]**.

**Step 1: Guest details** (all required **[?]**)
First name, last name, email, phone, address, zip code, state. Button: **Next**.

**Step 2: Emergency contacts**
Identical to the member signup emergency contacts step (same fields, relationships list, add several, validation). Button: **Next**. Minimum of one contact, as for members.

**Step 3: Guest agreement**
Guest (read in person, on the member's device) reads the current published guest agreement and signs, using the same signature control as the member waiver. A signed PDF is produced and emailed to the guest and to the hosting member.

This step also contains a required **retention acknowledgment** the guest must tick before they can sign: *"I understand and agree that my information, including my signed agreement, emergency contacts and photo ID, will be kept for at least 2 years after my last visit."* The acceptance (with date/time and agreement revision) is stored with the signature **[?]** or could be a clause in the agreement itself; checkbox recommended so it works across revisions.

**Step 4 (last): Photo ID**
Works like the member photo ID step (same upload/camera capture, validation, and encrypted storage as `members/photo` and onboarding ID). Phone: opens the camera directly. The image is **attached to the guest record** and is what appears next to the guest's name at check-in (G-10). Guest is **Ready** only after this step is complete.

**Cancel / bail out (differs from the member wizard)**
- **G-11** Every step has **Cancel**. Cancelling closes the wizard and **saves progress**; the guest is stored as **INCOMPLETE** with whatever was entered.
- **G-12** Progress is saved per step on "Next" and on Cancel, so nothing typed is lost.
- **G-13** Incomplete guests can be resumed indefinitely, or deleted under the rules in 4.6.
- **G-13a** "Complete" now means: details, at least one emergency contact, signed current agreement with retention acknowledgment, and photo ID.

### 4.4 Guest agreement: versioning and notification
- **G-14** The guest agreement is **structured content** (title, ordered sections with heading and body, closing statement), not a hard-coded page, the same shape as the member agreement.
- **G-15** It is **versioned**. Published versions are immutable; a change is a new revision with a plain-language "what changed" summary (same rule as members today).
- **G-16** Admins have an editor to change it (mirroring the existing admin waiver editor at `/admin/crm/waiver`).
- **G-17** **Drafts**: an admin can save a work-in-progress revision, edit it repeatedly, **preview** it exactly as signers will see it, and then **publish**. Drafts are not visible to members or guests and nobody is asked to sign them.
- **G-18** **Same draft capability for the member agreement.** Today the member editor publishes directly; it gains Save draft, Preview and Publish.
- **G-19** When a new guest revision is published, **existing guests who signed an earlier revision are notified by email** (using the "what changed" summary).
- **G-20** Whether a guest must **re-sign** before the next check-in follows the member rule: admin marks a revision **mandatory** or not. A guest with a mandatory revision unsigned is not check-in-eligible until they re-sign **[?]** (how: link in email vs. member helps on the spot).

### 4.6 Deleting a guest and retention
- **G-25** A member can delete their own guest profiles.
- **G-26** Delete first shows a confirmation modal: **"This will delete all data for this guest in our system. Are you sure?"** with Cancel and Delete.
- **G-27** Deletion is **blocked** unless the guest's **last check-in was more than 2 years ago**. Otherwise the modal instead says: **"Sorry! We have to retain their records for 2 years."** (suggest also showing the date the guest becomes deletable **[?]**).
- **G-28** Guests who never checked in: the 2 years are counted from the date the profile was last touched/completed **[?]**. An INCOMPLETE guest that never got signed **[?]** could be deletable at once since no agreement exists.
- **G-29** Delete removes everything for that guest: details, emergency contacts, signed agreement PDF, photo ID and check-in history **[?]** check with legal that nothing must outlive the 2 years.
- **G-30** Deletion is audit-logged (who, which guest id, when) without keeping the personal data.
- **G-31** The retention period (2 years) is a single configurable value, not scattered through the code.

### 4.5 Check-in and log
- **G-21** Check-in is one click on a Ready guest, recording guest, host member, and timestamp.
- **G-22** The **check-in log** lists guest name, date/time, and (for admins) host. It is visible to the member **[?] location: suggest a "Guest visits" section on the member home page or Profile, below tool sign-offs.** Admins see all guests' visits **[?]**.
- **G-23** Duplicate check-ins: if already checked in today, show that instead of logging again **[?]** (or allow multiple per day).
- **G-24** Check-out is not tracked in v1.

## 5. Business rules
1. A guest belongs to exactly one member (their host). Same person hosted by two members = two records **[?]**.
2. Check-in eligibility = details complete AND at least one emergency contact AND signed current (or non-mandatory-outdated) guest agreement.
3. Published agreement revisions are never edited or deleted.
4. Guest personal data (address, phone, emergency contacts, signature) is as sensitive as member data: same privacy and encryption treatment. **Records are retained for 2 years after the last check-in, and the guest agrees to this (G-25 to G-31).** Photo ID images are stored encrypted like member IDs.
5. Guest emails are used only for the agreement PDF and revision notices, not marketing.

## 6. Data (conceptual)
- **Guest**: host member, name, email, phone, address, zip, state, status (incomplete/ready), step reached, created/updated.
- **Guest emergency contact**: same fields as member contacts.
- **Guest agreement version**: revision, title, sections, closing, summary, mandatory, status (draft/published), author, dates. Member versions get the same draft status.
- **Guest signature**: guest, version, signed PDF, signed date, retention acknowledgment (accepted, when).
- **Guest photo ID**: guest, encrypted image.
- **Guest access link**: guest, token hash, expiry (for the QR handoff).
- **Guest check-in**: guest, host, timestamp.

## 7. Non-functional
- QR/guest links: random tokens, expire, usable only for that one guest's wizard, rate-limited.
- Modal/wizard fully usable on phones (full screen, large tap targets), keyboard accessible, same a11y as existing wizard.
- All admin actions (publish, draft changes) are audit-logged, as existing waiver actions are.

## 8. Open questions (please answer at review)
1. Are all guest detail fields required, or only name and one contact method?
2. Do guests ever get a login, or are they always handled via the host member's device?
3. Minors: can a guest be under 18? If so, a parent/guardian signature rule is needed. **This is the biggest legal risk; recommend deciding before build.**
4. QR handoff: how long should the link last, and may it also be sent by text/email? (Step 0)
5. Visit limits (per guest per month, guests per member at once)? Cost or day-pass rules?
6. Where does the member see the check-in log (G-22)? Do admins/staff need a door-side view?
7. Re-sign flow for guests on a mandatory revision (G-20).
8. Retention: if a guest never checked in, when does the 2 years start? Can an INCOMPLETE, never-signed guest be deleted immediately? Does legal require anything kept longer than 2 years? Can admins override the block?
9. Should staff approve guests, or is it self-service entirely?
10. Does the member-agreement draft feature change who can publish (any admin, or restricted)?

## 9. Suggested delivery order
1. Drafts + preview for the member agreement (self-contained, benefits existing flow).
2. Guest data model, guest agreement versions (reusing the same editor), and retention setting.
3. Home card, guest modal, list.
4. Wizard (reusing the member steps incl. photo ID), QR handoff, incomplete/resume.
5. Check-in, log, guest photo/history pane, deletion with retention rule.
6. Revision notifications to guests.
