// Run with `npm test`. Chore due dates, stats, achievements and spoken-name matching.
import { test } from "node:test";
import assert from "node:assert";

const { dueAt, stats, achievements, matchMember, daysBetween, dayStart, dayNum, periodStart } = await import("../lib/chores-calc.ts");

const DAY = 86400;
const now = Date.UTC(2026, 10, 18, 17) / 1000; // Wed 2026-11-18 noon in Detroit
const chore = (id, o = {}) => ({ id, name: "clean the bathroom", aliases: [], every_days: 14, notes: "", snoozed_until: null, active: true, created_at: now - 40 * DAY, ...o });
const shift = (id, o = {}) => ({ id, chore_id: 1, user_id: 7, owner_name: "Sarah Lee", started_at: now - 3600, ended_at: now - 1800, minutes: 30, ...o });

test("due date: last done plus the interval, the snooze if later, never for as-needed", () => {
  const c = chore(1);
  assert.equal(dueAt(c, null), c.created_at + 14 * DAY);
  assert.equal(dueAt(c, now - DAY), now + 13 * DAY);
  assert.equal(dueAt({ ...c, snoozed_until: now + 30 * DAY }, now - DAY), now + 30 * DAY);
  assert.equal(dueAt({ ...c, every_days: null }, null), null);
});

test("calendar days and period starts follow the space's timezone", () => {
  assert.equal(daysBetween(now - 2 * DAY, now), 2);
  assert.equal(dayStart(dayNum(now)), Date.UTC(2026, 10, 18, 5) / 1000); // midnight EST is 05:00 UTC
  assert.equal(periodStart("this_week", now), Date.UTC(2026, 10, 16, 5) / 1000); // Monday
  assert.equal(periodStart("this_month", now), Date.UTC(2026, 10, 1, 4) / 1000); // EDT until Nov 1 2am
});

test("stats count hours, people, on-time visits and the awards that follow", () => {
  const chores = [chore(1), chore(2, { name: "sweep the floors", every_days: null })];
  const rows = [shift(1), shift(2, { chore_id: 2, user_id: 8, owner_name: "Tom", started_at: now - 2 * DAY, ended_at: now - 2 * DAY + 3600, minutes: 60 })];
  const s = stats(chores, rows, now);
  assert.equal(s.this_week.sessions, 2);
  assert.equal(s.this_week.hours, 1.5);
  assert.equal(s.this_week.volunteers, 2);
  assert.equal(s.all_time.on_time, 0); // bathroom was 26 days late the first time
  assert.deepEqual(s.this_week.people.map((p) => p.who), ["Tom", "Sarah Lee"]);
  assert.ok(s.this_week.awards.some((a) => a.kind === "marathon" && a.who === "Tom"));
  assert.equal(s.this_week.timeline.length, 7);
});

test("an achievement is earned by the shift that reaches the goal", () => {
  const rows = [1, 2, 3].map((i) => shift(i, { started_at: now - (4 - i) * DAY, ended_at: now - (4 - i) * DAY + 1800 }));
  const [a] = achievements([chore(1)], rows, [{ id: 1, chore_id: 1, measure: "times", goal: 2, title: "Porcelain Knight", icon: "", note: "" }], now);
  assert.equal(a.earned.length, 1);
  assert.equal(a.earned[0].log_id, 2);
  const [h] = achievements([chore(1)], rows, [{ id: 2, chore_id: null, measure: "hours", goal: 5, title: "x", icon: "", note: "" }], now);
  assert.deepEqual(h.close, [{ who: "Sarah Lee", have: 1.5 }]);
});

test("spoken names: full name, then a first name only one member has, then near matches", () => {
  const m = [{ id: 1, name: "Jon Kelley" }, { id: 2, name: "Sarah Lee" }, { id: 3, name: "Sarah Park" }];
  assert.deepEqual(matchMember("jon kelley", m), { status: "match", how: "full", member: m[0] });
  assert.equal(matchMember("Jon", m).member.id, 1);
  assert.equal(matchMember("Sarah", m).status, "ambiguous");
  const near = matchMember("John Kelly", m);
  assert.equal(near.status, "maybe");
  assert.equal(near.candidates[0].id, 1);
  assert.equal(matchMember("Zebediah Quux", m).status, "none");
});
