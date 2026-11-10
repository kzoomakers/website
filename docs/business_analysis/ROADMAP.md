# Roadmap

Derived from [PROCESS_GAPS.md](PROCESS_GAPS.md) and the rest of the [business analysis](BUSINESS_PROCESS_OVERVIEW.md). Gap IDs (G-nn) link back to the evidence. Nothing here is approved policy: items marked **Decision** need a stakeholder answer before build, and the recommended option is only a recommendation. Gap G-17 was withdrawn and is not used.

## How items are ordered

1. **Policy first.** Several 🔴 gaps (dues, membership lifecycle, retention) are business-rule problems, not UI problems. Building screens before the rule exists would invent policy.
2. **Close silent failures next.** Cheap fixes where a person is never told something changed (G-03 to G-07, G-13). Each reuses an existing mechanism (`notifyUser`, mail queue, `checkStale`).
3. **Safety and compliance** (G-08, G-14, G-18).
4. **Hygiene and polish.**

Effort: S = under a day, M = a few days, L = a week or more. Effort is a rough estimate from the evidence in the gaps document, not a measured figure.

---

## Phase 0 — Decisions (no code, start now)

These unblock Phase 2 and 3. Owner is the most appropriate stakeholder.

| # | Decision | Gap | Owner | Recommended option (not approved) |
| --- | --- | --- | --- | --- |
| D1 | Where are dues collected, and how do staff learn of non-payment? | G-01 | Board / treasurer | Keep payment external; add a "paid through" date staff maintain |
| D2 | Membership states and who changes them (active / lapsed / resigned) and what a lapsed member can still access | G-02 | Board + membership lead | Three states; lapsed loses members-area access except profile and resign. **Proposed instead: four states (adds on hold) and a 14-day grace period, see below.** |
| D3 | Retention periods for IDs, signed agreements, approval threads, emergency contacts, tour bookings | G-08 | Board + counsel | ID image removed N months after leaving; counsel confirms what waivers must be kept |
| D4 | Does "at least 3 administrators" include Google-allow-list admins? | G-09 | Board | Count both, and say so in the message |
| D5 | Are tool sign-offs enforced by the system or only informational? Do volunteer hours earn anything? | G-14, G-15 | Shop lead / board | Notify-only for sign-offs; verification only if hours earn benefits |
| D6 | Sign-up cap per hour, and event-night procedure | G-10 | Admins | Make configurable; document the reset |
| D7 | Should a handbook change require re-acknowledgement? | G-16 | Board | Record version always; re-acknowledge only for material changes |

### Proposed answers for Phase 2 (pending board approval)

Chosen in a planning session; **not approved policy** until the board confirms.

| # | Proposed answer |
| --- | --- |
| D1 | Payment stays external. Staff maintain a `paid_through` date per member; the system reminds staff before it passes. Bulk "extend N months" deferred. |
| D2 | Four states: **active / on hold / lapsed / resigned**. A 14-day grace period (admin setting) after `paid_through`, then auto-lapse. A lapsed member can reach profile, renewal info and resign only, via a friendly "dues lapsed, here's how to renew" page. |
| D6 | `SIGNUPS_PER_HOUR` becomes an admin setting; document the event-night reset. |

Open sub-questions to confirm: on hold pauses the dues clock, blocks the same access as lapsed, and needs a return date; staff admins never lose admin access by lapsing; long-lapsed data removal is left to Phase 3 retention (D3); member-facing state names are fixed once and reused everywhere.

Build order: states + `paid_through` (back-fill all members first, or everyone lapses on day one) → staff controls → CRM "who is current" + lapse digest → grace/auto-lapse job → access gate last.

---

## Phase 1 — Stop silent failures (1–2 weeks, no policy needed)

Small, independent, each uses an existing pattern.

| Item | Gap | Change | Effort |
| --- | --- | --- | --- |
| Waitlist promotion notice | G-05 | On `cancelSignUp`, notify the promoted attendee (in-app + email) | S |
| Class cancel / change notice | G-06 | On `saveClass` cancel or time/location change, notify everyone signed up | S |
| Declined signature alert | G-07 | Email the creator on `declineByToken`; show "declined" state in the paper list | S |
| Applicant acknowledgement + stale alert | G-03 | Auto-email applicant stating what to expect; alert staff when Pending > N days (reuse `checkStale`) | M |
| Held contact-message digest | G-04 | Daily digest of held messages to forms staff | S |
| Tour reminder emails | G-13 | 24 h and 2 h reminder email with cancel link | M |
| Admin health screen + staff checklist | G-21, G-20 | One page listing required settings (allow-list, sender, key, plans, certificate) and whether each is set; document the two login paths | M |

**Done when:** every state change in the table above reaches the affected person, and a missing required setting is visible without reading code.

---

## Phase 2 — Membership lifecycle (after D1, D2)

| Item | Gap | Change | Effort |
| --- | --- | --- | --- |
| Membership states | G-02 | Add status and "paid through" to `memberships`; staff controls to change it; audit entries | M |
| Resign action | G-02 | Member-initiated leave, distinct from staff "disable" and irreversible "delete" | M |
| Back-fill `paid_through` | G-01 | Set a date for every existing member before any lapse automation runs, or all lapse on day one | S |
| Grace period + auto-lapse job | G-02 | Admin setting (default 14 days); flip to `lapsed` once past `paid_through` + grace; never lapse staff admins | M |
| Lapsed access rule | G-02 | Gate the members area per D2 | M |
| Dues visibility | G-01 | "Who is current" list in the CRM; reminder to staff of upcoming lapses | M |
| Raise / configure sign-up cap | G-10 | Setting instead of constant `SIGNUPS_PER_HOUR` | S |

**Done when:** staff can answer "who is a current member" from the system and a person can leave without staff deleting their record.

---

## Phase 3 — Safety and compliance (after D3, D4, D5)

| Item | Gap | Change | Effort |
| --- | --- | --- | --- |
| Extend retention cleanup | G-08 | Cover IDs, tour bookings, approval threads, emergency contacts per D3; keep what counsel requires | L |
| Sign-off expiry alerts | G-14 | Notify member and staff 30 days before expiry; "expiring" list in the CRM | M |
| Second approver for mandatory agreements | G-18 | Require a second person to publish; weekly digest of ID views | M |
| Administrator-count rule | G-09 | Implement D4; error message names who is counted | S |
| Handbook version record | G-16 | Store version at acknowledgement; optional re-acknowledge per D7 | M |

**Done when:** a written retention schedule exists and the cleanup job matches it.

---

## Phase 4 — Hygiene (as capacity allows)

| Item | Gap | Change | Effort |
| --- | --- | --- | --- |
| Agreement-update email as a queued campaign | G-11 | Replace the in-process loop with a campaign so restarts resume | S |
| Walk-up decline cap | G-12 | After N declines, notify a lead or close with a message | S |
| Volunteer hours review | G-15 | Confirm step for long entries, only if D5 says hours matter | S |
| Link tour outcome to account | G-19 | Match tour email to account; real conversion in statistics | M |

---

## UX work that runs alongside

The gaps above are process gaps. These UX items follow from them and should ship with the matching phase rather than separately.

- **Every new notification needs an in-app and an email form** and a plain-language reason ("Your class was cancelled" not "status changed").
- **Dead ends to remove:** a declined or disabled person sees a "disabled" message not designed for resignations (G-02); a held contact sender sees success with no follow-up (G-04). Give both an honest, actionable message.
- **Completion feedback:** applicants should see where they are in the queue states (Pending / Waiting) and what happens next (G-03).
- **Responsive layouts:** the members profile now uses the full browser width down to phones; apply the same pattern when new lifecycle screens are added, and check keyboard and screen-reader behavior against WCAG 2.2 AA.
- **Terminology:** pick one set of words for membership states (D2) and use it on the site, emails and admin screens.

---

## Not covered / needs follow-up

- Admin and member screen components were sampled, not read in full, so visual dead ends and confusing labels are not in the gap list. A screen-by-screen UX review is a separate work item.
- Items marked 🔶 in the gaps (G-09, G-11, G-14, G-15, G-20) should be confirmed with the people who run the system before build.
- The first-account "founder" recovery path is undefined (see the sign-up workflow's open questions).
- Dependencies between D-items and phases are listed above; effort figures are estimates.
