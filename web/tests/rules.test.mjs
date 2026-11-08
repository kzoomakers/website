// Run with `npm test`. Class notice floor, mail retry backoff, and the sign-in rate limit staying clear of bulk class mail.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const { noticeDays, MIN_CLASS_DAYS, backoffMinutes, MAX_MAIL_TRIES } = await import("../lib/rules.ts");

test("class notice can be raised but never dropped below 45 days", () => {
  assert.equal(MIN_CLASS_DAYS, 45);
  for (const stored of [undefined, null, "x", 0, 10, 44]) assert.equal(noticeDays(stored), 45, String(stored));
  assert.equal(noticeDays(60), 60);
});

test("mail retries wait twice as long each time, capped at 6 hours", () => {
  assert.deepEqual([1, 2, 3, 4].map(backoffMinutes), [2, 4, 8, 16]);
  assert.equal(backoffMinutes(MAX_MAIL_TRIES + 20), 360);
});

test("bulk class links are not counted against the public sign-in link limit", () => {
  assert.match(readFileSync("lib/readers.ts", "utf8"), /next <> '\/members\/classes'/);
});
