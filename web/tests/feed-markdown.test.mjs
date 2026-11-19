// Run with `npm test`. Behavior mirrors Lobsters' Markdowner.
import { test } from "node:test";
import assert from "node:assert/strict";

const { renderMarkdown, mentionedUsers } = await import("../feed/markdown.ts");

test("raw HTML is escaped, never rendered", () => {
  const h = renderMarkdown('hi <script>alert(1)</script> <b>x</b>');
  assert.ok(!h.includes("<script") && !h.includes("<b>"), h);
});
test("javascript: links are not links", () => assert.ok(!renderMarkdown("[x](javascript:alert(1))").includes("href")));
test("headings become strong, links get rel=ugc, strikethrough and autolink work", () => {
  assert.match(renderMarkdown("# Title"), /<strong>Title<\/strong>/);
  assert.match(renderMarkdown("see https://example.com now"), /<a href="https:\/\/example.com" rel="ugc nofollow">/);
  assert.match(renderMarkdown("~~gone~~"), /<s>gone<\/s>/);
});
test("images become links unless allowed", () => {
  assert.match(renderMarkdown("![cat](https://e.com/c.jpg)"), /<a href="https:\/\/e.com\/c.jpg"[^>]*>cat<\/a>/);
  assert.match(renderMarkdown("![cat](https://e.com/c.jpg)", { allowImages: true }), /<img /);
});
test("mentions link only known users, not inside links or code", () => {
  const users = new Set(["alice"]);
  assert.match(renderMarkdown("hello @alice and ~alice, not @bob", { users }), /<a href="\/~alice" rel="ugc nofollow">@alice<\/a> and <a href="\/~alice"[^>]*>~alice<\/a>, not @bob/);
  assert.ok(!renderMarkdown("[@alice](https://e.com)", { users }).includes("/~alice"));
  assert.ok(!renderMarkdown("`@alice`", { users }).includes("/~alice"));
  assert.ok(!renderMarkdown("mail me@alice.com", { users }).includes("/~alice"), "\\B stops email addresses");
  assert.deepEqual(mentionedUsers("@Alice @bob ~alice x"), ["alice", "bob"]);
});
test("empty and oversize input", () => {
  assert.equal(renderMarkdown("  "), "");
  assert.ok(renderMarkdown("a".repeat(200_000)).length < 70_000);
});
