// Run with `npm test`. Walk-up offer dates in emails follow daylight saving.
import { test } from "node:test";
import assert from "node:assert";

const { fmtOffer, checkOffers } = await import("../lib/tours-fmt.ts");

test("offer labels show weekday, 12-hour times and EST/EDT", () => {
  assert.equal(fmtOffer({ date: "2026-11-12", start: "15:15", end: "16:15" }), "11/12/26, a Thursday, at 3:15 PM – 4:15 PM (EST)");
  assert.match(fmtOffer({ date: "2026-07-09", start: "10:00", end: "11:00" }), /\(EDT\)$/);
});

const NOW = "2026-11-08 12:00", ok = { date: "2026-11-12", start: "15:00", end: "16:00" };
test("checkOffers sorts good times and rejects bad ones", () => {
  assert.deepEqual(checkOffers([{ ...ok, date: "2026-11-14" }, ok], NOW).map((o) => o.date), ["2026-11-12", "2026-11-14"]);
  assert.throws(() => checkOffers([], NOW), /between 1 and 5/);
  assert.throws(() => checkOffers(Array(6).fill(ok), NOW), /between 1 and 5/);
  assert.throws(() => checkOffers([{ ...ok, date: "11/12/26" }], NOW), /needs a date/);
  assert.throws(() => checkOffers([{ ...ok, end: "14:00" }], NOW), /ends before/);
  assert.throws(() => checkOffers([{ ...ok, date: "2026-11-08", start: "09:00", end: "10:00" }], NOW), /already past/);
});

const { reminderDue, cleanEmail, cleanDays } = await import("../lib/tours-fmt.ts");
test("reminders are due only in the 30 minutes after their moment", () => {
  assert.equal(reminderDue(350)?.[1], "reminder_6h"); // booked late: still fine, 10 minutes after the 6h moment
  assert.equal(reminderDue(120), undefined); // 2h out: the 3h reminder is long gone and 1h isn't here yet
  assert.equal(reminderDue(59)?.[1], "reminder_1h");
  assert.equal(reminderDue(0)?.[1], "reminder_now");
  assert.equal(reminderDue(-10)?.[1], "reminder_now");
  assert.equal(reminderDue(-31), undefined); // already started: nothing hours-old gets logged
});
test("notification settings reject bad emails and day counts", () => {
  assert.equal(cleanEmail("  Ann@Example.org "), "ann@example.org");
  assert.throws(() => cleanEmail("no-at-sign"), /isn't valid/);
  assert.throws(() => cleanEmail("a b@c.de"), /isn't valid/);
  assert.equal(cleanDays("0"), 0);
  assert.throws(() => cleanDays(91), /0 \(off\) to 90/);
  assert.throws(() => cleanDays(1.5), /whole number/);
});
