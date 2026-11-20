// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("search finds stories and comments, ranks, filters, matches partial words, hides deleted", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { createStory } = await import("../feed/models/submit.ts");
  const { createComment } = await import("../feed/models/comment-write.ts");
  const { search } = await import("../feed/models/search.ts");
  const { parseQuery } = await import("../feed/search-rules.ts");
  const c = await conn(), n = Date.now().toString(36), word = "zq" + n; // a word nothing else uses
  const cat = (await c.query(`INSERT INTO feed.categories (category, token) VALUES ($1, 'c${n}') RETURNING id`, ["cat" + n])).rows[0].id;
  await c.query(`INSERT INTO feed.tags (tag, category_id, token) VALUES ($1, $2, 't${n}')`, ["tg" + n, cat]);
  const u = (await c.query(`INSERT INTO feed.users (username, email, token, created_at) VALUES ($1, $2, 'u${n}', now() - interval '200 days') RETURNING id`, ["srch" + n, `s${n}@example.org`])).rows[0];
  const a = await createStory(u, { title: `Cutting ${word} acrylic`, url: "", description: "kerf and focus notes", tags: ["tg" + n], userIsAuthor: true });
  const b = await createStory(u, { title: "Something else entirely", url: "", description: `mentions ${word} only in the text`, tags: ["tg" + n], userIsAuthor: true });
  assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
  const cm = await createComment(u, { storyShortId: a.shortId, comment: `The ${word} setting works for lasers` });
  assert.ok(cm.ok, JSON.stringify(cm));

  const s = await search("stories", parseQuery(word), "relevance", 1);
  assert.deepEqual(s.stories.map((x) => x.short_id), [a.shortId, b.shortId], "title match (weight A) outranks a text match");
  assert.equal(s.count, 2); assert.match(s.snippets.get(String(s.stories[1].id)), /⟦/);
  assert.equal((await search("stories", parseQuery(`${word} tag:tg${n} -acrylic`), "newest", 1)).stories.length, 1, "exclusion and tag filter");
  assert.equal((await search("stories", parseQuery(`tag:nonexistent${n}`), "newest", 1)).count, 0);
  const f = await search("stories", parseQuery(word.slice(0, -2)), "relevance", 1);
  assert.ok(f.fuzzy && f.count >= 2, "partial word falls back to prefix matching");
  const cs = await search("comments", parseQuery(`${word} commenter:srch${n}`), "relevance", 1);
  assert.equal(cs.count, 1); assert.match(cs.comments[0].snippet, /⟦/); assert.equal(cs.comments[0].story_short_id, a.shortId);
  await c.query("UPDATE feed.comments SET is_deleted = true WHERE short_id = $1", [cm.shortId]);
  assert.equal((await search("comments", parseQuery(word), "newest", 1)).count, 0, "deleted comments are not searchable");
  await c.query("UPDATE feed.stories SET is_deleted = true WHERE short_id = $1", [b.shortId]);
  assert.equal((await search("stories", parseQuery(word), "newest", 1)).count, 1, "deleted stories are not searchable");
});
