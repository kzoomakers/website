// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;

test("unsubscribing blocks every tour email path, takes back offers, and the page can say what it costs", { skip: !url && "set TEST_DATABASE_URL" }, async () => {
  const { conn } = await import("../lib/db.ts");
  const t = await import("../lib/tours.ts");
  await t.listRequests(true); // creates the tours tables on first use
  const c = await conn(), n = Date.now(), email = `unsub-${n}@example.org`, tok = `u${n}`;
  const offers = JSON.stringify([{ date: "2099-01-05", start: "10:00", end: "11:00" }]);
  const id = (await c.query("INSERT INTO tour_requests (first_name, last_name, email, phone, token, status, offers) VALUES ('Una','Sub',$1,'2695550100',$2,'offered',$3) RETURNING id", [email, tok, offers])).rows[0].id;
  try {
    const before = await t.checkinByToken(tok);
    assert.equal(before.offered, true); assert.deepEqual(before.upcoming, []);
    const r = await t.respondCheckin(tok, "unsubscribed", 0, "", "http://x");
    assert.equal(r.answer, "unsubscribed");
    const row = (await c.query("SELECT status, interest_state, offers FROM tour_requests WHERE id = $1", [id])).rows[0];
    assert.equal(row.interest_state, "unsubscribed"); assert.equal(row.status, "open", "the offer is taken back"); assert.deepEqual(row.offers, []);
    await assert.rejects(t.postStaff("request", id, "hello", false, "Staff", "http://x"), /unsubscribed from tour emails/);
    assert.ok(!(await t.checkinCandidates()).some((x) => x.id === id), "never in a bulk check-in");
    await t.postStaff("request", id, "internal only", true, "Staff", "http://x"); // notes are still fine
  } finally {
    await c.query("DELETE FROM tour_messages WHERE kind = 'request' AND ref_id = $1", [id]);
    await c.query("DELETE FROM tour_requests WHERE id = $1", [id]);
  }
});
