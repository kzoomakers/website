import test from "node:test";
import assert from "node:assert/strict";
import { trackSteps } from "../lib/courses/track.ts";

const base = { read: null, course: null, practised: null, hasTest: true, state: "not_started", blocked: false };
const show = (t) => trackSteps(t).map((s) => `${s.key}:${s.status}`).join(" ");

test("only the steps a tool has appear; the first undone is current", () => {
  assert.equal(show(base), "test:current signoff:todo done:todo");
  assert.equal(show({ ...base, hasTest: false }), "done:current");
  assert.equal(show({ ...base, read: { total: 2, acked: 1 }, course: { done: 0, total: 3 }, practised: false }), "read:current learn:todo practise:todo test:todo signoff:todo done:todo");
});

test("progress moves the current step along", () => {
  const t = { ...base, read: { total: 1, acked: 1 }, course: { done: 3, total: 3 }, practised: true };
  assert.equal(show(t), "read:done learn:done practise:done test:current signoff:todo done:todo");
  assert.equal(show({ ...t, state: "awaiting_trainer" }), "read:done learn:done practise:done test:done signoff:current done:todo");
  assert.equal(show({ ...t, state: "certified" }), "read:done learn:done practise:done test:done signoff:done done:done");
});

test("open requirements lock the test, and an old authorization needs no test", () => {
  assert.equal(show({ ...base, read: { total: 1, acked: 0 }, blocked: true }), "read:current test:locked signoff:todo done:todo");
  assert.equal(show({ ...base, hasTest: false, state: "certified" }), "test:done signoff:done done:done");
});
