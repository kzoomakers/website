// Run with `npm test`. The per-user allowance for AI rewrites.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL; // tests must never touch a real database (the limiter then uses memory)
import { test } from "node:test";
import assert from "node:assert";

const { spend } = await import("../lib/limit.ts");

test("10 calls an hour: the 11th is refused and refused tries don't count", async () => {
  const r = await Promise.all(Array.from({ length: 10 }, () => spend("t", 10, 3600_000)));
  assert.ok(r.every((x) => x.ok));
  assert.equal(r[6].left, 3);
  assert.ok(!(await spend("t", 10, 3600_000)).ok);
  assert.equal((await spend("t", 10, 3600_000)).used, 10);
  assert.ok((await spend("other", 10, 3600_000)).ok);
});
