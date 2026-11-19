// Run with `npm test`. RSS and JSON output shapes (Lobsters' stories.rss.builder and as_json).
import { test } from "node:test";
import assert from "node:assert/strict";

const { storyJson, commentJson, storiesRss, commentsRss } = await import("../feed/format.ts");
const O = "https://talk.example";
const story = { short_id: "abc123", title: "The A & B <thing>", url: "https://x.example/p", created_at: new Date("2026-01-02T03:04:05Z"), score: 4, flags: 1, comments_count: 2, description: "d", markeddown_description: "<p>d<script>x</script></p>", username: "alice", user_is_author: true, domain: "x.example", tags: [{ tag: "zed" }, { tag: "ant" }] };

test("story json: Lobsters' keys in order, sorted tags, cleaned description, short and title URLs", () => {
  const j = storyJson(O, story);
  assert.deepEqual(Object.keys(j), ["short_id", "created_at", "title", "url", "score", "flags", "comment_count", "description", "description_plain", "submitter_user", "user_is_author", "tags", "short_id_url", "comments_url"]);
  assert.deepEqual(j.tags, ["ant", "zed"]);
  assert.equal(j.description, "<p>d</p>");
  assert.equal(j.short_id_url, `${O}/s/abc123`);
  assert.equal(j.comments_url, `${O}/s/abc123/b_thing`);
});

test("story rss: escaped text, author line, comments link appended for link stories, categories", () => {
  const x = storiesRss(O, "Newest Stories", `${O}/newest.rss`, [story]);
  assert.match(x, /<title>Kzoo Makers Talk: Newest Stories<\/title>/);
  assert.match(x, /<title>The A &amp; B &lt;thing&gt;<\/title>/);
  assert.match(x, /<author>x.example by alice<\/author>/);
  assert.match(x, /<link>https:\/\/x.example\/p<\/link>/);
  assert.match(x, /&lt;p&gt;Comments&lt;\/a&gt;|Comments&lt;\/a&gt;&lt;\/p&gt;/);
  assert.match(x, /<category>zed<\/category>/);
  assert.match(x, /<pubDate>Fri, 02 Jan 2026 03:04:05 \+0000<\/pubDate>/);
});

test("comment json and rss show the removal text for gone comments, never the original", () => {
  const c = { short_id: "cm1", story_short_id: "abc123", story_title: "Hello", created_at: new Date(0), last_edited_at: new Date(0), is_deleted: true, is_moderated: false, score: 1, flags: 0, parent_short_id: null, comment: "secret", markeddown_comment: "<p>secret</p>", depth: 0, username: "bob", user_banned_at: null };
  const j = commentJson(O, c);
  assert.equal(j.comment, "<em>Comment removed by its author</em>"); assert.equal(j.comment_plain, "Comment removed by its author");
  assert.equal(j.url, `${O}/s/abc123/hello#c_cm1`);
  assert.ok(!commentsRss(O, "Newest Comments", `${O}/comments.rss`, "talk.example", [c]).includes("secret"));
});
