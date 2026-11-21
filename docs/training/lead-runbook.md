# Training lead runbook

For the training lead. Covers switching things on and off, re-pass rollouts, overrides, regrading wrong answers, personal information, and what to do when something goes wrong.


## Choosing which workflows your space uses

**Admin > People > Workflows** has two switches: **Classes** and **Online tests and trainer sign-off**. Any combination works: both, classes only, tests only, or neither (staff grant authorizations by hand from the member's page).

- Switching one off hides it from the members menu, the home page and the Tool authorizations page, and pauses its reminders and announcements. Classes, sign-ups, tests, certifications and authorizations are all kept, and come back as they were when you switch it on again.
- Tool authorizations themselves are always on.
- **No online tests?** A trainer starts hands-on training from the sign-off queue (**Start hands-on training with someone**), adds notes, then signs them off. This is offered for any tool while online tests are off, and for any tool that has no published test. A tool that does have a test needs the test first (a lead can waive it).
- Switching a workflow off also hides its admin menu link (Classes, Training tests). The pages still open by URL, with a notice.
- Changes can take up to 30 seconds to show for members.
- Only administrators can change these switches. Admin pages for a switched-off workflow stay open (with a notice at the top) so you can finish what is in flight.

## Switching training on and off

**Training settings** has one switch. Off means:

- members can't start tests, and the Training pages are hidden;
- emails and Discord posts stop;
- **re-pass deadlines pause**. Nobody lapses while it's off.

Switching it off does **not** remove anyone's existing authorization. Switch it back on and the deadlines resume where they were.

## Re-pass rollouts

A major version creates a rollout with a deadline. Every current holder is listed. The rollouts table lists the rollout, how many are pending, satisfied or lapsed, and the deadline.

- **Extend** moves the deadline for everyone still owing a re-pass. It needs the special permission **Force a re-pass**.
- **Undo rollout** clears the re-pass deadline for everyone in the rollout and restores anyone who had lapsed. Use it if a major version was published by mistake. It is logged; it does not delete anything.
- **Exempt** a member needs the **Override** permission.
- **Lapse guard**: if a sweep would lapse more than half of a rollout's people, it stops and waits. Confirm the lapse on the rollout row when you're sure. This stops a wrong deadline or a bad version from locking out the whole shop.

Lapsed people keep their authorization record. It reads as expired everywhere until they pass the new version.

## Overrides

Overrides are under **Override…** in a member's file, not the normal buttons. Options: waive the test, skip training, certify now, credit a prior certification (with the date they were certified), revoke, and void an attempt. Each needs a reason of at least a sentence, goes in the member's file and the audit log, and emails the lead list. Nobody can override their own training.

**Reset attempts** (a member used up their tries, or is waiting out a cooldown): use the Override panel on the reports page, action "Reset attempts", pick the member and tool, and give a reason. Their earlier attempts stay on record but stop counting toward the limit and the wait, so they start again at attempt 1. It covers every test on that tool, is logged, and doesn't email the member, so tell them.

Needs the special permission **Override**.

## Regrading a wrong answer key

Use this when a published question had the wrong correct answer. Nobody re-takes the test.

1. The author makes a draft, fixes the key and publishes it as a **minor** version. The corrected version must keep every question.
2. Go to **Reports > Regrade a wrong answer key**. Choose the test, the version people took, and the corrected version.
3. **Preview** shows how many will pass now, how many would fail, and how many are unchanged. Nothing is written yet.
4. **Apply** is blocked while anyone is still mid-test on the old version. Wait until they finish, then apply.
5. Applying does two things:
   - People who failed and now pass are passed at once. Their certification opens in the sign-off queue as usual.
   - People who passed but would now fail are **not** changed. Each appears under **Waiting for a decision**.
6. For each pending person, **Keep pass** (the trainer saw the work and the pass stands) or **Revoke pass** (the reason goes in their file). Revoking takes back only what that attempt earned: an open certification, or the authorization it granted. A later pass that certified them isn't touched.

A regrade can't be applied twice to the same pair of versions. Every change is in the audit log and in the regrade history on the same screen.

## Personal information

- **Training record** (a person's whole record) and **Test attempt (evidence)** are personal information. Staff open them with **Retrieve info**: a reason is required, and the access is logged and reported to the board monthly, like other personal information.
- A member's own download is logged as their own access.
- **Erasing a member** (Admin > People > delete) removes their attempts and answers, certifications, notes, accommodations and training authorizations. Other people's rows are untouched. The audit log keeps that an erasure happened, by whom and when. Discord posts already made stay on Discord.
- Attempts older than five years are removed by the retention job.

## Accommodations

Trainers set them from a member's file. You can see them there too. Extra time and read-aloud are copied onto each test when it starts, so a change only affects tests started after it.

## When something goes wrong

| Situation | What to do |
|---|---|
| Wrong key on a published question | Regrade (above). Don't edit the published version. |
| A major version went out by mistake | Undo rollout. Check the audit log to see who published it. |
| Lots of people about to lapse | The lapse guard holds them. Check the version and the deadline before confirming. |
| A trainer has left | Assign their tools to someone else under **Trainers**. Nothing re-routes automatically, so check the queue for items waiting on those tools. |
| A test was published with a problem | Publish a corrected minor version. Regrade if people already took the old one. |
| A dispute about a result | Open the member's file, **Evidence for this attempt**, give the reason, and download it. |
| Discord webhook stops working | The post is retried, then parked as failed on the Discord settings page. Certifications are unaffected. Fix the webhook and send a test post. |
| Mail queue is down | Emails retry automatically. Certifications are unaffected. |

## Not built yet

- No alert when the lapse sweep stops running. Check the audit log for `training.rollout.lapse` entries if you suspect it has stopped.
- No printable certificate, no trainer-to-member messaging, no checklist for hands-on training, and no prerequisites between tools.
- No automatic escalation of long waits in the queue, and no weekly trainer digest.
