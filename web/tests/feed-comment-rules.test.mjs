// Run with `npm test`. Rules from Lobsters' comment.rb.
import { test } from "node:test";
import assert from "node:assert/strict";

const { commentProblems, speedDelayMins, isEditable, isDeletable } = await import("../feed/comment-rules.ts");

test("canned rejections", () => {
  for (const [text, msg] of [["this", "nope"], ["This.", "Nope."], ["tl;dr", "Wow!  A blue car!"], ["> >", "If a tree falls"], ["bump this", "Don't bump"], ["A B C", "D O N ' T"], ["+1", "Please just upvote"], ["nice!", "Please just upvote"], ["\u{1F680}", "🚫"], ["", "cannot be empty"]])
    assert.ok(commentProblems(text).some((p) => p.startsWith(msg) || p.includes(msg)), `${text} -> ${commentProblems(text)}`);
  for (const ok of ["This is a real comment", "I think nice is subjective", "Thisisfine", "> quoted\n\nreply"]) assert.deepEqual(commentProblems(ok), [], ok);
});
test("speed limit grows with flags", () => { assert.equal(speedDelayMins(0, 0), 2); assert.equal(speedDelayMins(3, 1), 6); });
test("edit window counts from the last edit; delete window is 14 days from creation", () => {
  const now = Date.parse("2026-06-01T12:00:00Z"), ago = (m) => new Date(now - m * 60_000);
  const c = (o) => ({ user_id: 1, is_deleted: false, is_moderated: false, last_edited_at: ago(10), created_at: ago(10), ...o });
  assert.ok(isEditable(c({ last_edited_at: ago(359) }), 1, now)); assert.ok(!isEditable(c({ last_edited_at: ago(361) }), 1, now));
  assert.ok(!isEditable(c(), 2, now)); assert.ok(!isEditable(c({ is_deleted: true }), 1, now)); assert.ok(!isEditable(c({ is_moderated: true }), 1, now));
  assert.ok(isDeletable(c({ created_at: ago(60 * 24 * 13) }), 1, now)); assert.ok(!isDeletable(c({ created_at: ago(60 * 24 * 15) }), 1, now)); assert.ok(!isDeletable(c(), 2, now));
});
