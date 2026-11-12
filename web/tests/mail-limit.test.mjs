// Run with `npm test`. The daily send limit: how much room is left today.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert/strict";
const { roomToday } = await import("../lib/mail.ts");

test("daily limit: 0 means no limit, otherwise what is left of today's allowance", () => {
  assert.equal(roomToday(0, 999), Infinity);
  assert.equal(roomToday(100, 0), 100);
  assert.equal(roomToday(100, 70), 30);
  assert.equal(roomToday(100, 100), 0);
  assert.equal(roomToday(100, 130), 0, "overshoot never goes negative");
});
