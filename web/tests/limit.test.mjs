// Run with `npm test`. The per-user allowance for AI rewrites.
import { test } from "node:test";
import assert from "node:assert";

const { spend } = await import("../lib/limit.ts");

test("10 calls an hour: the 11th is refused and refused tries don't count", () => {
  const r = Array.from({ length: 10 }, () => spend("t", 10, 3600_000));
  assert.ok(r.every((x) => x.ok));
  assert.equal(r[6].left, 3);
  assert.ok(!spend("t", 10, 3600_000).ok);
  assert.equal(spend("t", 10, 3600_000).used, 10);
  assert.ok(spend("other", 10, 3600_000).ok);
});
