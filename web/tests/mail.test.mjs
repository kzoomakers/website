// Run with `npm test`. The maths behind the email Tracking screens.
import { test } from "node:test";
import assert from "node:assert";

const { engagement, MARKS } = await import("../lib/mail-track.ts");
test("engagement: burn-up totals, speed buckets, median and half-life", () => {
  const t = (opened, clicked = null, hour = 9) => ({ opened, clicked, hour: opened == null ? null : hour });
  const e = engagement([t(60), t(600, 700), t(3 * 3600), t(2 * 86400), t(null)]);
  assert.equal(e.curve[MARKS.indexOf(5)].opened, 1);
  assert.equal(e.curve[MARKS.indexOf(60)].opened, 2);
  assert.equal(e.curve[MARKS.indexOf(15)].clicked, 1);
  assert.equal(e.curve[MARKS.length - 1].opened, 4);
  assert.equal(e.medianSec, 600);
  assert.equal(e.halfMin, 15, "half of the 4 openers by 15 minutes");
  assert.equal(e.speed.reduce((a, [, n]) => a + n, 0), 4);
  assert.equal(e.hours[9], 4);
  assert.equal(engagement([t(null)]).medianSec, null);
});
