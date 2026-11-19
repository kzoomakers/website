// Run with `npm test`. The vendored .ics reader: today's events, recurrence, multi-day spans.
import { test } from "node:test";
import assert from "node:assert";
import { parseICS, eventsOn } from "../public/vendor/kzoo-calendar/index.js";

const ics = (...ev) => ["BEGIN:VCALENDAR", ...ev.map((l) => ["BEGIN:VEVENT", ...l, "END:VEVENT"].join("\r\n")), "END:VCALENDAR"].join("\r\n");
const now = new Date(2026, 10, 18, 9, 0); // Wed 18 Nov 2026

test("one-off, all-day, weekly and multi-day events land on the right day", () => {
  const events = parseICS(ics(
    ["SUMMARY:Open night", "DTSTART:20261118T190000", "DTEND:20261118T210000"],
    ["SUMMARY:Tomorrow only", "DTSTART:20261119T190000", "DTEND:20261119T200000"],
    ["SUMMARY:Yesterday all day", "DTSTART;VALUE=DATE:20261117", "DTEND;VALUE=DATE:20261118"],
    ["SUMMARY:Wed class\\, weekly", "DTSTART:20261104T180000", "DTEND:20261104T190000", "RRULE:FREQ=WEEKLY;BYDAY=WE"],
    ["SUMMARY:Conference", "DTSTART;VALUE=DATE:20261116", "DTEND;VALUE=DATE:20261120"],
  ), now);
  assert.deepEqual(eventsOn(events, now).map((e) => e.title), ["Conference", "Wed class\\, weekly", "Open night"]);
});

test("EXDATE skips a recurring day", () => {
  const events = parseICS(ics(["SUMMARY:Wed", "DTSTART:20261104T180000", "DTEND:20261104T190000", "RRULE:FREQ=WEEKLY;BYDAY=WE", "EXDATE:20261118T180000"]), now);
  assert.equal(eventsOn(events, now).length, 0);
  assert.equal(eventsOn(events, new Date(2026, 10, 25)).length, 1);
});

test("an edited single occurrence replaces its repeat instead of doubling it; a cancelled one vanishes", () => {
  const master = ["UID:a", "SUMMARY:Wed", "DTSTART:20261104T180000", "DTEND:20261104T190000", "RRULE:FREQ=WEEKLY;BYDAY=WE"];
  const moved = ["UID:a", "SUMMARY:Wed (moved)", "RECURRENCE-ID:20261118T180000", "DTSTART:20261118T200000", "DTEND:20261118T210000"];
  assert.deepEqual(eventsOn(parseICS(ics(moved, master), now), now).map((e) => e.title), ["Wed (moved)"]); // override listed first
  assert.deepEqual(eventsOn(parseICS(ics(master, moved), now), now).map((e) => e.title), ["Wed (moved)"]);
  const gone = ["UID:a", "SUMMARY:Wed", "RECURRENCE-ID:20261118T180000", "STATUS:CANCELLED", "DTSTART:20261118T180000", "DTEND:20261118T190000"];
  assert.equal(eventsOn(parseICS(ics(master, gone), now), now).length, 0);
});
