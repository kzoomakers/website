// Run with `npm test`. Rules from Lobsters' story.rb.
import { test } from "node:test";
import assert from "node:assert/strict";

const { storyProblems, cleanTitle, isNewUser } = await import("../feed/story-rules.ts");
const tag = (tag, o = {}) => ({ tag, permit_by_new_users: true, privileged: false, is_media: false, ...o });
const ok = { title: "A fine title", url: "https://example.com/a", description: "", tags: [tag("python")], isNew: false, isModerator: false };

test("a normal story has no problems", () => assert.deepEqual(storyProblems(ok), []));
test("title length, screaming, graphics, redundant Ask", () => {
  assert.equal(storyProblems({ ...ok, title: "ab" }).length, 1);
  assert.equal(storyProblems({ ...ok, title: "x".repeat(151) }).length, 1);
  assert.match(storyProblems({ ...ok, title: "STOP SHOUTING" })[0], /scream/);
  assert.deepEqual(storyProblems({ ...ok, title: "1234 5678" }), [], "no letters is not shouting");
  assert.match(storyProblems({ ...ok, title: "Laser \u{1F680} time" })[0], /graphics/);
  assert.match(storyProblems({ ...ok, title: "Ask the club", tags: [tag("ask")] })[0], /redundant/);
  assert.deepEqual(storyProblems({ ...ok, title: "Ask the club", tags: [tag("python")] }), []);
});
test("url or description required; url must be valid", () => {
  assert.match(storyProblems({ ...ok, url: "" })[0], /Description must contain text/);
  assert.deepEqual(storyProblems({ ...ok, url: "", description: "text post" }), []);
  assert.match(storyProblems({ ...ok, url: "https://localhost/x" })[0], /not valid/);
  assert.match(storyProblems({ ...ok, url: "https://e.com/" + "a".repeat(250) })[0], /too long/);
});
test("tags: at least one non-media, privileged only for mods, new users limited", () => {
  assert.match(storyProblems({ ...ok, tags: [] })[0], /non-media/);
  assert.match(storyProblems({ ...ok, tags: [tag("pdf", { is_media: true })] })[0], /non-media/);
  assert.match(storyProblems({ ...ok, tags: [tag("meta", { privileged: true })] })[0], /permission/);
  assert.deepEqual(storyProblems({ ...ok, isModerator: true, tags: [tag("meta", { privileged: true })] }), []);
  assert.match(storyProblems({ ...ok, isNew: true, tags: [tag("meta", { permit_by_new_users: false }), tag("python")] })[0], /New users/);
  assert.deepEqual(storyProblems({ ...ok, isNew: false, tags: [tag("meta", { permit_by_new_users: false })] }), []);
});
test("new user means under 70 days", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  assert.ok(isNewUser(new Date("2026-04-01T00:00:00Z"), now)); assert.ok(!isNewUser(new Date("2026-03-01T00:00:00Z"), now)); assert.ok(isNewUser(null, now));
  assert.equal(cleanTitle("a b"), "a b");
});

test("a picture stands in for text when there is no link", () => {
  const post = { ...ok, url: "", description: "" };
  assert.equal(storyProblems(post).length, 1);
  assert.deepEqual(storyProblems({ ...post, image: true }), []);
});
