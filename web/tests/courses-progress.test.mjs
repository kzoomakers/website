import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, continueAt, isComplete, unlockedIds } from "../lib/courses/progress.ts";

const cl = { id: "c1", type: "checklist", items: ["a", "b"] }, vid = { id: "v1", type: "video", yt: "dQw4w9WgXcQ", caption: "", transcript: "", chapters: [] };

test("each completion rule", () => {
  assert.equal(isComplete({ rule: "viewed" }, [], {}), false);
  assert.equal(isComplete({ rule: "viewed" }, [], applyAction([], {}, { action: "view" })), true);
  assert.equal(isComplete({ rule: "done" }, [], { viewed: true }), false);
  assert.equal(isComplete({ rule: "done" }, [], { done: true }), true);
  assert.equal(isComplete({ rule: "video" }, [vid], { video: true }), true);
  assert.equal(isComplete({ rule: "quiz", percent: 80 }, [], {}), false);
  assert.equal(isComplete({ rule: "quiz", percent: 80 }, [], { quiz: 79 }), false);
  assert.equal(isComplete({ rule: "quiz", percent: 80 }, [], { quiz: 80 }), true);
  assert.equal(isComplete({ rule: "quiz", percent: 100 }, [], { quiz: 0 }), false);
});

test("checklist ticks: validated, toggled, all required", () => {
  let d = applyAction([cl], {}, { action: "tick", block: "c1", idx: 0, on: true });
  assert.equal(isComplete({ rule: "checklist" }, [cl], d), false);
  d = applyAction([cl], d, { action: "tick", block: "c1", idx: 1, on: true });
  assert.equal(isComplete({ rule: "checklist" }, [cl], d), true);
  d = applyAction([cl], d, { action: "tick", block: "c1", idx: 1, on: false });
  assert.equal(isComplete({ rule: "checklist" }, [cl], d), false);
  assert.equal(applyAction([cl], {}, { action: "tick", block: "c1", idx: 2, on: true }), null);
  assert.equal(applyAction([cl], {}, { action: "tick", block: "nope", idx: 0, on: true }), null);
  assert.equal(applyAction([cl], {}, { action: "video" }), null);
  assert.equal(applyAction([cl], {}, { action: "bogus" }), null);
});

test("sequential unlock and continue", () => {
  const order = [1, 2, 3];
  assert.deepEqual([...unlockedIds(order, new Set(), true)], [1]);
  assert.deepEqual([...unlockedIds(order, new Set([1]), true)], [1, 2]);
  assert.deepEqual([...unlockedIds(order, new Set([2]), true)], [1]); // done out of order doesn't skip ahead
  assert.deepEqual([...unlockedIds(order, new Set(), false)], [1, 2, 3]);
  assert.equal(continueAt(order, new Set([1])), 2);
  assert.equal(continueAt(order, new Set([1, 2, 3])), null);
});
