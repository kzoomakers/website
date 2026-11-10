// Run with `npm test`. ntfy tokens: plain a-z words, drawn from the whole list, and cheap on memory.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";

const { makeToken } = await import("../lib/ntfy.ts");

test("ntfy token: doubled symbol first, then four a-z words of 3 to 8 letters", () => {
  for (let i = 0; i < 200; i++) {
    const t = makeToken(), m = /^(.)\1([a-z]{3,8}) ([a-z]{3,8}) ([a-z]{3,8}) ([a-z]{3,8})(.{2})$/u.exec(t);
    assert.ok(m, t);
  }
});

test("ntfy token: words come from the whole list, not just the first few", () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) for (const w of makeToken().split(/[^a-z]+/).filter((w) => w.length >= 3)) seen.add(w);
  assert.ok(seen.size > 600, `only ${seen.size} different words in 1600 draws`); // the old code could only ever produce 256
  assert.notEqual(makeToken(), makeToken());
});
