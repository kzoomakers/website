// Run with `npm test`. The rules for the photo ID upload.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";

const { checkId } = await import("../lib/onboarding.ts");
const now = Date.parse("2026-11-08T12:00:00Z"), ok = (...a) => checkId(...a, now);

test("a current license passes; expired, undated or unknown kinds are refused", () => {
  ok("license", "2030-01-01");
  assert.throws(() => ok("license", "2020-01-01"), /expired/);
  assert.throws(() => ok("license", ""), /expiration date/);
  assert.throws(() => ok("library", "2030-01-01"), /kind of ID/);
});

test("a college ID may have no date", () => ok("college", ""));
