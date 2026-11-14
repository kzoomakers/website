// Run with `npm test`. The ID card's expiry wording and the unlock cookie.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL; process.env.AUTH_SECRET = "test-secret";
import { test } from "node:test";
import assert from "node:assert";

const { daysLeft, expiryLine } = await import("../lib/id-card.ts");
const { idUnlocked, unlockValue } = await import("../lib/readers.ts");
const now = Date.parse("2026-11-08T12:00:00");

test("days left counts today as still valid and past dates as negative", () => {
  assert.equal(daysLeft("2026-11-08", now), 1);
  assert.ok(daysLeft("2026-11-07", now) <= 0);
  assert.equal(expiryLine(-3), "Your ID has expired.");
  assert.equal(expiryLine(1), "Your ID expires in 1 day.");
});

test("the unlock cookie works only for the member it was made for", () => {
  const v = unlockValue(5);
  assert.ok(idUnlocked(5, v));
  assert.ok(!idUnlocked(6, v));
  assert.ok(!idUnlocked(5, v.slice(0, -2) + "00"));
  assert.ok(!idUnlocked(5, undefined));
});
