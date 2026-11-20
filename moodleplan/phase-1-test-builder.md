# Phase 1: test builder

Admin > People > Training > Tests. Author drafts, preview, publish revisions. Nobody can take a test yet.

## Screens

1. **Test library**: list per tool: title, current revision, status (draft pending / published), attempts, pass rate (blank until phase 2). "New test for tool…" picker (only tools without a test, unless adding a second test is allowed).
2. **Test editor** (one draft at a time):
   - Settings: intro (rich text, sanitized), pass %, time limit, max attempts, cooldown, shuffle questions/choices, review mode, grace days, question pool size ("draw N of M").
   - Question list with drag-to-reorder (keyboard reorder too), points, critical flag, duplicate, delete.
   - Question editor per type (below) with live member-view preview beside it.
   - Autosave to the draft; "unsaved" indicator; optimistic concurrency (`updated_at` check) so two authors don't overwrite each other silently.
3. **Preview as member**: take the draft end to end with grading shown, no attempt/cert created (`preview` flag).
4. **Revision history**: list of revisions with change note, author, date, major/minor, attempts per revision; **diff view** between two revisions (questions added/removed/changed, setting changes).
5. **Publish dialog**: validation report, major/minor choice (default major when any question's key changed), change note (required), "affects N members" preview (computed in phase 4; stub shows 0 until then), confirm. Needs `training.publish`.

## Question types shipped

All ten in `01` (mc_single, mc_multi, true_false, image_label, match, order, fill_blank, short_text, numeric, hotspot). Build order by value: mc_single, true_false, mc_multi, **image_label**, order, match, fill_blank, numeric/short_text, hotspot. Each type is one file implementing the same interface:

```ts
type QType = {
  validate(config): Problem[]          // publish-time checks, e.g. "zone 3 has no label"
  toMember(config, seed): MemberView   // strips the key, shuffles by seed
  grade(config, answer): { points: number; max: number; correct: boolean; detail: unknown }
  describe(config): string             // plain-text summary for diffs/exports
}
```

`grade` is pure and has unit tests per type including partial credit, empty answers, malformed answers, and oversized payloads.

### Diagram labelling editor (the one that needs care)

- Upload image (reuse `lib/image.ts` resize + `lib/s3.ts`; limit size and dimensions; strip metadata). Alt text required.
- Click-drag on the image to draw zones (stored as % of width/height so it scales); resize/move by mouse and arrow keys.
- Label list on the side; link each label to a zone; add decoy labels; allow a label to be reused or not.
- Member rendering: pointer drag **and** click-to-pick/click-to-place **and** keyboard; a "list view" fallback where each zone is a dropdown.
- Touch support tested on a phone (shop floor use is likely).

## Publish rules (server-enforced)

- At least one question; every question valid; points > 0; pass % between 1 and 100; critical questions don't make passing impossible; pool size <= number of questions.
- Publishing: copies nothing (questions already belong to the draft revision), sets `status='published'`, computes `content_hash`, retires the previous published revision, creates the next draft lazily when someone edits (copy-on-write from the published one, new `rev_no`, same `qkey`s).
- Once published, UPDATE/DELETE on that revision's rows is refused in code. Add a DB trigger that raises on UPDATE/DELETE of `rev_questions` or `test_revisions` rows whose revision is published, so a bug can't corrupt history.

## Import/export

JSON export of a revision (questions + settings, images referenced by key) for backup and board review; JSON import into a new draft. CSV import for simple multiple choice.

## Security

- Prompt HTML passes `lib/sanitize.ts`; image uploads validated by content, not extension.
- All endpoints `training:tests` write; publish additionally `canSpecial("training.publish")`.
- Answer keys are in `config`; the **member** API must use `toMember()` only. Add a test that walks every question type and asserts the member view contains none of the key fields.

## Tests

Per-type grade tests; validate tests; draft/publish immutability (attempt to edit a published revision fails, DB trigger fires); copy-on-write keeps `qkey`s; permission matrix from `02`.

## Done when

An author can build a mixed test with a labelled diagram, preview it, publish revision 1, edit it into a draft revision 2, and see a diff, with the audit log showing each step.
