# Test author guide

You write the tests members take. Each test belongs to one tool (version 1 allows one test per tool). Members only ever take a published version.

## Tests and versions

- **Admin > People > Training > Tests** lists the tests. Create one for a tool that doesn't have one yet.
- You edit a **draft**. Publishing freezes that version. Nobody can change a published version; the editor makes a new draft from it.
- **Compare** shows what changed between two versions.
- **Export** gives a JSON copy of a version (for backup or the board). **Import** loads one into a draft.

## Settings for a version

- **Intro**: shown before the test (rich text, sanitized).
- **Pass mark**: a percentage, 1 to 100.
- **Time limit**: minutes, or none. Trainers can add extra time per member.
- **Tries and wait**: a maximum number of tries, and hours to wait between them.
- **Shuffle** questions and choices.
- **Question pool**: draw a number of questions from a larger set, so retakes differ.
- **Review after a try**: score only, missed questions only (the default), or everything with correct answers.
- **Grace period** (days): for a major change, how long people have to pass the new version.

## Questions

Ten types: multiple choice (one answer or several), true/false, diagram (drag names onto labels), matching pairs, put in order, fill in the blanks, short answer, number (with tolerance), and click the spot on a picture.

- Mark a question **critical** if it must be right whatever the score. Missing a critical question fails the test.
- Every picture needs alt text, and every diagram label needs text.
- Use **Preview** to try the test as a member. A preview creates no attempts or certifications.

## Publishing

Check that the validation report is empty, then choose:

- **Minor**: a typo or a corrected answer. Existing passes stay valid.
- **Major**: the content changed in a way that matters. Current holders must pass the new version within the grace period, or they lapse. The dialog shows how many people it affects before you confirm.

Every publish needs a change note. People affected by a major change are emailed it.

Publishing needs the special permission **Publish tests**. Starting a re-pass needs **Force a re-pass**. A lead gives these under Admin > Access > Special permissions.

## If an answer is wrong

Don't edit the published version. Make a draft, fix the key, and publish it as a **minor** change. Then the lead regrades the people who already took the old version (see the lead runbook). Regrading needs the corrected version to keep every question, so don't delete questions while you fix keys.
