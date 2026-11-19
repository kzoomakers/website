// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("submitting a story creates the story, tags, domain, origin, vote and counters; resubmits and banned domains are refused", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { createStory } = await import("../feed/models/submit.ts");
  const c = await conn(), n = Date.now().toString(36);
  const cat = (await c.query(`INSERT INTO feed.categories (category, token) VALUES ($1, 'c${n}') RETURNING id`, ["cat" + n])).rows[0].id;
  const tag = (await c.query(`INSERT INTO feed.tags (tag, category_id, token, hotness_mod) VALUES ($1, $2, 't${n}', 0.5) RETURNING id`, ["tg" + n, cat])).rows[0];
  const old = (await c.query(`INSERT INTO feed.users (username, email, token, created_at) VALUES ($1, $2, 'u${n}', now() - interval '200 days') RETURNING id`, ["old" + n, `old${n}@example.org`])).rows[0];
  const fresh = (await c.query(`INSERT INTO feed.users (username, email, token, created_at) VALUES ($1, $2, 'u2${n}', now()) RETURNING id`, ["new" + n, `new${n}@example.org`])).rows[0];
  const base = { description: "hello @old" + n, tags: ["tg" + n], userIsAuthor: true };
  const host = `www.site${n}.com`;

  const r = await createStory(old, { ...base, title: "A story about lasers", url: `https://${host}/post?utm_source=x&id=1#top` });
  assert.ok(r.ok, JSON.stringify(r));
  const s = (await c.query("SELECT s.*, d.domain, d.stories_count dc FROM feed.stories s JOIN feed.domains d ON d.id = s.domain_id WHERE s.short_id = $1", [r.shortId])).rows[0];
  assert.equal(s.url, `https://${host}/post?id=1#top`); assert.equal(s.normalized_url, `site${n}.com/post?id=1`); assert.equal(s.domain, `site${n}.com`); assert.equal(s.dc, 1);
  assert.equal(s.score, 1); assert.ok(s.user_is_author); assert.ok(s.hotness < 0);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.taggings WHERE story_id = $1", [s.id])).rows[0].n, 1);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.votes WHERE story_id = $1 AND vote = 1", [s.id])).rows[0].n, 1);
  assert.match(s.markeddown_description, /hello/);

  const dup = await createStory(old, { ...base, title: "Another title here", url: `http://site${n}.com/post?id=1` });
  assert.ok(!dup.ok && /already been submitted/.test(dup.errors[0]) && dup.similar.length === 1, JSON.stringify(dup));
  const newbie = await createStory(fresh, { ...base, title: "Newbie link", url: `https://other${n}.com/x` });
  assert.ok(!newbie.ok && /unseen domain/.test(newbie.errors[0]), JSON.stringify(newbie));
  await c.query("UPDATE feed.domains SET banned_at = now(), banned_reason = 'spam' WHERE lower(domain) = $1", [`site${n}.com`]);
  const banned = await createStory(old, { ...base, title: "Banned domain post", url: `https://site${n}.com/other` });
  assert.ok(!banned.ok && /banned domain/.test(banned.errors[0]), JSON.stringify(banned));
  const text = await createStory(old, { title: "A text post only", url: "", description: "just words", tags: ["tg" + n], userIsAuthor: false });
  assert.ok(text.ok, JSON.stringify(text));
  assert.ok((await c.query("SELECT user_is_author FROM feed.stories WHERE short_id = $1", [text.shortId])).rows[0].user_is_author);
  assert.ok(!(await createStory(old, { ...base, title: "Unknown tag post", url: "", tags: ["nope"] })).ok);
  assert.equal((await c.query("SELECT value FROM feed.keystores WHERE key = $1", [`user:${old.id}:stories_submitted`])).rows[0].value, "2");
});
