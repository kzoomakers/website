// Run with `npm test`. The calendar feed copy: refresh failures keep the old copy, one fetch at a time, and a minute of back-off.
import { test, mock } from "node:test";
import assert from "node:assert";

const { getFeed, resetFeed } = await import("../lib/calendar-feed.ts");
globalThis.dbg = { at: Date.now() + 1e12, on: {} }; // debug streams off, without a database
mock.method(console, "error", () => {});

let calls = 0, mode = "ok";
globalThis.fetch = async () => {
  calls++;
  await new Promise((r) => setTimeout(r, 5));
  if (mode === "down") throw new Error("down");
  if (mode === "500") return new Response("no", { status: 500 });
  return new Response("BEGIN:VCALENDAR " + mode);
};
const reset = (m = "ok") => { resetFeed(); calls = 0; mode = m; mock.timers.reset(); };

test("people asking at the same time share one fetch; later asks use the copy", async () => {
  reset();
  const all = await Promise.all([getFeed(), getFeed(), getFeed()]);
  assert.deepEqual(all, Array(3).fill("BEGIN:VCALENDAR ok"));
  await getFeed();
  assert.equal(calls, 1);
});

test("Google down with no copy: null, then no new attempt for a minute", async () => {
  reset("down");
  mock.timers.enable({ apis: ["Date"], now: 1e12 });
  assert.equal(await getFeed(), null);
  assert.equal(await getFeed(), null);
  assert.equal(calls, 1);
  mock.timers.tick(61_000);
  assert.equal(await getFeed(), null);
  assert.equal(calls, 2);
  mock.timers.reset();
});

test("a failed refresh (error or bad status) keeps serving the old copy, including when forced", async () => {
  reset();
  mock.timers.enable({ apis: ["Date"], now: 1e12 });
  assert.equal(await getFeed(), "BEGIN:VCALENDAR ok");
  mock.timers.tick(2 * 3600_000); // copy is now older than an hour
  mode = "500";
  assert.equal(await getFeed(), "BEGIN:VCALENDAR ok");
  mode = "down";
  assert.equal(await getFeed(true), "BEGIN:VCALENDAR ok"); // the refresh button must not empty it
  mode = "new";
  assert.equal(await getFeed(true), "BEGIN:VCALENDAR new"); // and replaces it when Google answers
  mock.timers.reset();
});
