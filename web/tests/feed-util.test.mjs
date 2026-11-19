// Run with `npm test`. Pure helpers ported from Lobsters (story.rb title_as_slug, lib/time_ago_in_words.rb).
import { test } from "node:test";
import assert from "node:assert/strict";

const { titleAsSlug, howLongAgo, truncate, negativityClass } = await import("../feed/util.ts");

test("title slugs: drop small words, fold accents, cap at 35 characters of words", () => {
  assert.equal(titleAsSlug('Story number 1: The Laser & a "test"'), "story_number_1_laser_test");
  assert.equal(titleAsSlug("Café déjà vu"), "cafe_deja_vu");
  assert.equal(titleAsSlug("The a an"), "_");
  assert.equal(titleAsSlug("!!!"), "_");
  assert.equal(titleAsSlug("x".repeat(60)), "x".repeat(35), "one long word is cut");
  assert.equal(titleAsSlug("aaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbb"), "aaaaaaaaaaaaaaaaaaaa", "stops before the word that would not fit");
});

test("how long ago, at each boundary", () => {
  const now = new Date("2026-06-01T12:00:00Z"), ago = (s) => howLongAgo(new Date(now - s * 1000), now);
  assert.equal(ago(5), "just now"); assert.equal(ago(6), "less than a minute ago"); assert.equal(ago(60), "1 minute ago"); assert.equal(ago(125), "2 minutes ago");
  assert.equal(ago(3600), "1 hour ago"); assert.equal(ago(3600 * 47), "47 hours ago"); assert.equal(ago(3600 * 48), "2 days ago");
  assert.equal(ago(86400 * 30), "1 month ago"); assert.equal(ago(86400 * 365), "1 year ago"); assert.equal(ago(86400 * 800), "2 years ago");
});

test("truncate and negativity class", () => {
  assert.equal(truncate("abcdef", 6), "abcdef"); assert.equal(truncate("abcdefg", 6), "abc...");
  assert.deepEqual([[1, 0], [0, 1], [0, 3], [0, 5]].map(([s, f]) => negativityClass(s, f)), ["", "negative_1", "negative_3", "negative_5"]);
});
