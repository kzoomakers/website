// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;

test("activating the same walk-up twice at once succeeds once; undo puts it back", { skip: !url && "set TEST_DATABASE_URL" }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { activateTourPerson, undoActivation } = await import("../lib/approvals.ts");
  const { membershipClasses } = await import("../lib/membership.ts");
  await (await import("../lib/tours.ts")).listRequests(true); // creates the tours tables on first use
  const c = await conn(), email = `race-${Date.now()}@example.org`;
  const level = (await membershipClasses())[0].name;
  const id = (await c.query("INSERT INTO tour_requests (first_name, last_name, email, phone, token) VALUES ('Race','Test',$1,'2695550100',$2) RETURNING id", [email, "t" + Date.now()])).rows[0].id;
  try {
    const r = await Promise.allSettled([activateTourPerson("request", id, "t@kzoomakers.org", "http://x", level), activateTourPerson("request", id, "t@kzoomakers.org", "http://x", level)]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1, "exactly one click wins");
    assert.match(String(r.find((x) => x.status === "rejected").reason), /already activated/);
    assert.equal((await c.query("SELECT count(*)::int n FROM site_users WHERE email = $1", [email])).rows[0].n, 1);
    const u = await undoActivation("request", id, "t@kzoomakers.org", { confirm: true, staff: true });
    assert.equal(u.done, true);
    assert.equal((await c.query("SELECT count(*)::int n FROM site_users WHERE email = $1", [email])).rows[0].n, 0, "a brand-new account is removed");
    assert.equal((await c.query("SELECT activated_at FROM tour_requests WHERE id = $1", [id])).rows[0].activated_at, null);
  } finally {
    await c.query("DELETE FROM tour_requests WHERE id = $1", [id]);
    await c.query("DELETE FROM site_users WHERE email = $1", [email]);
  }
});
