// Run with `npm test`. The homepage "today's the day" card's countdown text.
import { test } from "node:test";
import assert from "node:assert";
import { countdown } from "../lib/today-countdown.ts";

const MIN = 60_000, H = 60 * MIN, t0 = 1_000_000_000_000;
const ev = (s, e, allDay = false) => ({ start: t0 + s, end: t0 + e, allDay });

test("before, during and after a timed event", () => {
  assert.deepEqual(countdown(ev(3 * H + 20 * MIN, 5 * H), t0), { state: "before", label: "STARTS IN", big: "3h 20m" });
  assert.equal(countdown(ev(0, 2 * H), t0 + 30 * MIN).big, "1h 30m left");
  assert.equal(countdown(ev(0, 2 * H), t0 + 2 * H).state, "over");
});

test("minutes round up to a clean hour, never '0h' or '60m'", () => {
  assert.equal(countdown(ev(59.6 * MIN, 3 * H), t0).big, "1h 00m");
  assert.equal(countdown(ev(5 * 1000, 3 * H), t0).big, "1m"); // under a minute still says 1m
});

test("all-day events and point-in-time events", () => {
  assert.equal(countdown(ev(0, 0, true), t0).big, "All day");
  assert.equal(countdown(ev(0, 0), t0 + H).state, "now"); // start === end: never "over"
});
