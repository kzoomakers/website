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

const { summarize } = await import("../lib/tours-fmt.ts");
const row = (o) => ({ day: "2026-11-06", dow: 5, hr: 10, status: "booked", cancelled: false, held: true, walkup: false, interest: "", heard: "", guide: "Sam", guide_email: "sam@x.org", close_days: null, est: false, ...o });
test("stats: rates count held tours only, guides group by email, empty days are filled", () => {
  const s = summarize([row({ status: "signed_up", close_days: 2 }), row({ status: "signed_up", close_days: 4, guide: "Sam K.", est: true }), row({ held: false }), row({ cancelled: true }), row({ day: "2026-11-08", status: "no_show", guide: "Lee", guide_email: "" })], 7, "2026-11-08");
  assert.equal(s.held, 3); assert.equal(s.won, 2); assert.equal(s.noShow, 1); assert.equal(s.days, 3); assert.equal(s.estimated, 1);
  assert.deepEqual(s.closers.map((c) => [c.name, c.tours, c.won]), [["Sam", 2, 2], ["Lee", 1, 0]]);
  assert.equal(s.series.length, 7); assert.deepEqual(s.series.at(-1), ["2026-11-08", 1]); assert.equal(s.series[0][0], "2026-11-02");
  assert.equal(summarize([], 30, "2026-11-08").days, null);
  assert.equal(summarize([], 365, "2026-11-08").weekly, true);
});

const { csvToRequests } = await import("../lib/tours-fmt.ts");
test("sign-up CSV rows become walk-ups, skipping rows with no email", () => {
  const csv = 'Timestamp,First Name,Last Name,Desired,"Area\n(all)",Phone,Email,Contact,Heard,,Why,Q\n2/13/2026 11:04:13,Ann,Lee,Makers,"Woodshop, Welding Shop, Soldering",269,a@b.co,Phone,Reddit,,"hi, there",\n2/14/2026 9:00:00,No,Mail,,,,,Text,,,,\n';
  const { rows, skipped } = csvToRequests(csv);
  assert.equal(rows.length, 1); assert.equal(skipped.length, 1);
  assert.deepEqual([rows[0].at, rows[0].interest, rows[0].contact], ["2026-02-13 11:04:13", "Wood shop, Metal shop", "Phone call"]);
  assert.match(rows[0].notes, /Why: hi, there/);
});

const { requestsToCsv } = await import("../lib/tours-fmt.ts");
test("walk-up export re-imports to the same rows (quotes, commas, newlines, Kalamazoo time)", () => {
  const csv = requestsToCsv([{ first_name: "Ann", last_name: 'Lee "AL"', interest: "Wood shop, Metal shop", phone: "269", email: "a@b.co", contact_method: "Phone call", notes: "Why: hi, there\nline two", created_at: new Date("2026-02-13T16:04:13Z") }]);
  assert.match(csv, /^Timestamp,First Name/);
  const { rows, skipped } = csvToRequests(csv);
  assert.equal(skipped.length, 0);
  assert.deepEqual([rows[0].first, rows[0].last, rows[0].email, rows[0].phone, rows[0].contact, rows[0].at], ["Ann", 'Lee "AL"', "a@b.co", "269", "Phone call", "2026-02-13 11:04:13"]);
  assert.match(rows[0].notes, /Why: hi, there\nline two/);
});

const { blocksToCsv, csvToBlocks, bookingsToCsv, csvToBookings, normDate, normTime, isStaffEmail } = await import("../lib/tours-fmt.ts");
test("availability CSV round-trips, and accepts US dates and 12-hour times", () => {
  const b = { date: "2026-11-14", start_time: "10:00", end_time: "12:00", slot_minutes: 30, max_per_slot: 2, guide_name: 'Sam "S" Lee, Jr.', guide_email: "sam@x.org" };
  const { rows, skipped } = csvToBlocks(blocksToCsv([b]));
  assert.equal(skipped.length, 0); assert.deepEqual(rows, [b]);
  const loose = csvToBlocks("Date,Start,End,Minutes per tour,People per tour,Guide name,Guide email\n11/14/2026,2:30 PM,4:00pm,,,,\nnot a date,10:00,11:00,30,1,,");
  assert.deepEqual([loose.rows[0].date, loose.rows[0].start_time, loose.rows[0].end_time, loose.rows[0].slot_minutes, loose.rows[0].max_per_slot], ["2026-11-14", "14:30", "16:00", 30, 1]);
  assert.equal(loose.skipped.length, 1);
  assert.deepEqual([normDate("2026-1-5"), normDate("13/40/2026"), normTime("12:15 AM"), normTime("12:15 PM"), normTime("25:00")], ["2026-01-05", "", "00:15", "12:15", ""]);
});
test("bookings CSV round-trips and skips rows without a name, time or email", () => {
  const r = { date: "2026-11-14", start_time: "10:30", first_name: "Ann", last_name: "Lee", email: "a@b.co", phone: "269 555 0123", zip: "49001", contact_method: "Phone call", interest: "Wood shop, Metal shop", heard: "Web search", visitor_notes: "line one\nline, two", status: "no_show", guide_email: "sam@x.org" };
  const { rows, skipped } = csvToBookings(bookingsToCsv([r]) + "2026-11-14,10:30,,,x@y.co,,,,,,,,\n");
  assert.equal(skipped.length, 1); assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].date, rows[0].start, rows[0].first, rows[0].last, rows[0].email, rows[0].zip, rows[0].interest, rows[0].notes, rows[0].status, rows[0].guide_email], ["2026-11-14", "10:30", "Ann", "Lee", "a@b.co", "49001", "Wood shop, Metal shop", "line one\nline, two", "no_show", "sam@x.org"]);
});
test("only kzoomakers.org staff (or the local dev admin) may reset a signed-up member", () => {
  assert.equal(isStaffEmail("jo@kzoomakers.org"), true); assert.equal(isStaffEmail("JO@KzooMakers.org"), true); assert.equal(isStaffEmail("dev"), true);
  assert.equal(isStaffEmail("jo@gmail.com"), false); assert.equal(isStaffEmail("jo@kzoomakers.org.evil.com"), false); assert.equal(isStaffEmail("kzoomakers.org"), false);
});

const { cell, parseCsv } = await import("../lib/tours-fmt.ts");
test("CSV export: text a spreadsheet would run as a formula is defused; phones and plain text are not changed", () => {
  assert.equal(cell('=HYPERLINK("http://x","go")'), `"'=HYPERLINK(""http://x"",""go"")"`);
  assert.equal(cell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(cell("-2+3x"), "'-2+3x");
  assert.equal(cell("+1 (269) 555-0100"), "+1 (269) 555-0100");
  assert.equal(cell("hello, world"), '"hello, world"');
  const row = { first_name: "=1+1", last_name: "Doe", interest: "", phone: "2695550100", email: "a@b.co", contact_method: "Text message", notes: "+cmd|' /C calc'!A0", created_at: "2026-11-01T12:00:00Z" };
  const text = requestsToCsv([row]);
  assert.ok(text.includes(",'=1+1,") && text.includes("'+cmd|"), "the file itself carries the mark");
  const line = parseCsv(text)[1];
  assert.equal(line[1], "=1+1");
  assert.equal(line[11], "+cmd|' /C calc'!A0");
  const back = parseCsv(`a,b\r\n${cell("=1+1")},${cell("+cmd")}\r\n`)[1]; // import undoes the mark
  assert.deepEqual(back, ["=1+1", "+cmd"]);
});

test("stats: burnup, weekly conversion, per-guide outcomes, close-time buckets and the guide filter", () => {
  const rows = [
    row({ day: "2026-11-02", status: "signed_up", close_days: 0.5, won_day: "2026-11-02", interest: "Wood shop, Laser shop", heard: "Friend", tdow: 2 }),
    row({ day: "2026-11-03", status: "signed_up", close_days: 5, won_day: "2026-11-08" }),
    row({ day: "2026-11-04", status: "no_interest", guide: "Lee", guide_email: "" }),
    row({ day: "2026-11-05", status: "maybe_later", guide: "Lee", guide_email: "" }),
    row({ day: "2026-11-06", status: "booked", held: false }),
  ];
  const s = summarize(rows, 7, "2026-11-08");
  const last = s.burnup.at(-1);
  assert.deepEqual([last.booked, last.won], [5, 2], "running totals end at the totals");
  assert.deepEqual(s.burnup.map((b) => b.won), [1, 1, 1, 1, 1, 1, 2], "a sign-up counts on the day it happened");
  assert.deepEqual(s.weeks.map((w) => [w.d, w.held, w.won]), [["2026-11-02", 4, 2]], "held tours per booking week");
  const sam = s.closers.find((c) => c.name === "Sam"), lee = s.closers.find((c) => c.name === "Lee");
  assert.deepEqual([sam.tours, sam.won, sam.unrecorded], [2, 2, 0]);
  assert.deepEqual([lee.tours, lee.lost, lee.later], [2, 0 + 1, 1]);
  assert.deepEqual(s.closeHist.filter(([, n]) => n).map(([l]) => l), ["Same day", "3–7 days"]);
  assert.deepEqual(s.groups.heard.find((g) => g.name === "Friend"), { name: "Friend", held: 1, won: 1 });
  assert.deepEqual(s.groups.interest.map((g) => g.name).sort(), ["Laser shop", "Not said", "Wood shop"]);
  const one = summarize(rows, 7, "2026-11-08", "sam@x.org");
  assert.equal(one.held, 2); assert.equal(one.won, 2);
  assert.equal(one.closers.length, 2, "the guide table still lists everyone");
  assert.deepEqual(one.guides.map((g) => g.name), ["Lee", "Sam"]);
});

const { canCheckIn, tabOf, queueOrder, addMonths } = await import("../lib/tours-fmt.ts");
const TODAY = "2026-11-13", NOWMS = +new Date("2026-11-13T12:00:00Z");
const ci = (o = {}) => ({ status: "open", interest_state: "active", snooze_until: null, last_sent: null, ...o });

test("check-ins go to open, active people not asked in the last 7 days", () => {
  assert.ok(canCheckIn(ci(), TODAY, NOWMS));
  assert.ok(!canCheckIn(ci({ status: "closed" }), TODAY, NOWMS), "dismissed/closed are left out");
  assert.ok(!canCheckIn(ci({ status: "offered" }), TODAY, NOWMS), "times already offered");
  assert.ok(!canCheckIn(ci({ interest_state: "not_interested" }), TODAY, NOWMS));
  assert.ok(!canCheckIn(ci({ interest_state: "not_now", snooze_until: "2026-12-01" }), TODAY, NOWMS), "still snoozed");
  assert.ok(canCheckIn(ci({ interest_state: "not_now", snooze_until: "2026-11-13" }), TODAY, NOWMS), "snooze date has arrived");
  assert.ok(!canCheckIn(ci({ last_sent: "2026-11-10T12:00:00Z" }), TODAY, NOWMS), "asked 3 days ago");
  assert.ok(canCheckIn(ci({ last_sent: "2026-11-05T12:00:00Z" }), TODAY, NOWMS));
});

test("tabs and snooze dates", () => {
  assert.equal(tabOf(ci(), TODAY), "waiting");
  assert.equal(tabOf(ci({ interest_state: "not_now", snooze_until: "2026-12-13" }), TODAY), "later");
  assert.equal(tabOf(ci({ interest_state: "not_now", snooze_until: "2026-11-01" }), TODAY), "waiting");
  assert.equal(tabOf(ci({ interest_state: "not_interested" }), TODAY), "no");
  assert.equal(addMonths("2026-11-30", 3), "2027-03-02"); // JS rolls Feb 30 over; fine for a check-back date
  assert.equal(addMonths("2026-11-13", 1), "2026-12-13");
});

test("queue: confirmed first by earliest (or latest) yes, then by request date", () => {
  const r = (id, created, first, last) => ({ id, created_at: created, first_confirmed: first, last_confirmed: last });
  const rows = [r(1, "2026-01-01", null, null), r(2, "2026-02-01", "2026-11-05", "2026-11-10"), r(3, "2026-03-01", "2026-11-01", "2026-11-02"), r(4, "2025-12-01", null, null)];
  assert.deepEqual(queueOrder(rows, false).map((x) => x.id), [3, 2, 4, 1]);
  assert.deepEqual(queueOrder(rows, true).map((x) => x.id), [2, 3, 4, 1]);
});

test("unsubscribed people are never checked in and sit under Not interested", () => {
  assert.ok(!canCheckIn(ci({ interest_state: "unsubscribed" }), TODAY, NOWMS));
  assert.equal(tabOf(ci({ interest_state: "unsubscribed" }), TODAY), "no");
});

const { goneQuiet, CHECKIN_BATCH } = await import("../lib/tours-fmt.ts");
test("gone quiet means the last two check-ins in a row had no reply", () => {
  const k = (...a) => a.map((x) => ({ answered_at: x ? "2026-11-01" : null }));
  assert.equal(goneQuiet(k()), false); assert.equal(goneQuiet(k(0)), false); assert.equal(goneQuiet(k(0, 0)), true);
  assert.equal(goneQuiet(k(0, 0, 1)), false, "they answered since"); assert.equal(goneQuiet(k(1, 0, 0)), true); assert.equal(goneQuiet(k(0, 1, 0)), false);
  assert.ok(CHECKIN_BATCH > 0 && CHECKIN_BATCH <= 50);
});

const { stageOf } = await import("../lib/tours-fmt.ts");
test("email stage follows the latest check-in", () => {
  const k = (o = {}) => ({ sent_at: "2026-11-01", viewed_at: null, answered_at: null, answer: null, ...o });
  assert.equal(stageOf({ status: "open", checkins: [] }), "new");
  assert.equal(stageOf({ status: "open", checkins: [k()] }), "sent");
  assert.equal(stageOf({ status: "open", checkins: [k({ viewed_at: "2026-11-02" })] }), "opened");
  assert.equal(stageOf({ status: "open", checkins: [k({ answered_at: "2026-11-02", answer: "interested" })] }), "yes");
  assert.equal(stageOf({ status: "open", checkins: [k({ answered_at: "2026-11-02", answer: "not_now" })] }), "new", "snooze ran out, so they need contacting again");
  assert.equal(stageOf({ status: "offered", checkins: [k()] }), "offered");
});
