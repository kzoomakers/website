// Run with `npm test`. Sitemap priority rises with recent edits and new pages, never past 0.9 (home 1.0).
import { test } from "node:test";
import assert from "node:assert";
import { priority } from "../lib/priority.ts";

const now = Date.parse("2026-11-08"), ago = (d) => new Date(now - d * 86400_000);
test("older pages keep their menu-depth base", () => {
  assert.equal(priority("a", 0, ago(400), ago(500), now), "0.8");
  assert.equal(priority("a", 1, ago(400), ago(500), now), "0.6");
  assert.equal(priority("a", 2, ago(400), ago(500), now), "0.4");
});
test("recent edit and new page raise it, capped at 0.9; home is 1.0", () => {
  assert.equal(priority("a", 2, ago(2), ago(500), now), "0.6");
  assert.equal(priority("a", 2, ago(2), ago(3), now), "0.7");
  assert.equal(priority("a", 0, ago(1), ago(1), now), "0.9");
  assert.equal(priority("index", 0, ago(400), ago(400), now), "1.0");
});
test("pages that predate the created_at column (stored as 2000-01-01) get the edit boost but never the new-page boost", () => {
  assert.equal(priority("a", 2, ago(1), new Date("2000-01-01"), now), "0.6");
});
test("blog posts: same 0.6 base as the blog index, boosted when fresh", () => {
  assert.equal(priority("post", 1, ago(400), ago(400), now), "0.6");
  assert.equal(priority("post", 1, ago(2), ago(2), now), "0.9");
});
