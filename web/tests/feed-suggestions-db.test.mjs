// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("suggestions: title quorum, withdrawing, tag quorum, who may suggest", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { suggest } = await import("../feed/models/suggestions.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name, age = 200, karma = 20) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, created_at) VALUES ($1, $2, $3, $4, now() - ($5 || ' days')::interval) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, karma, age])).rows[0];
  const [author, b, d, fresh, poor] = [await mk("a"), await mk("b"), await mk("d"), await mk("f", 1), await mk("p", 200, 0)];
  const cat = (await c.query("INSERT INTO feed.categories (category, token) VALUES ($1, $2) RETURNING id", ["cat" + n, "c" + n])).rows[0].id;
  const tag = async (name) => (await c.query("INSERT INTO feed.tags (tag, category_id, token, quorum) VALUES ($1, $2, $3, 2) RETURNING id", [name + n, cat, "t" + name + n])).rows[0];
  const [t1, t2] = [await tag("one"), await tag("two")];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'Original title', $2, $3, now(), now()) RETURNING id, short_id", [author.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];
  await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [st.id, t1.id]);
  const title = () => c.query("SELECT title, is_moderated FROM feed.stories WHERE id = $1", [st.id]).then((r) => r.rows[0]);
  const same = [("one" + n)];

  for (const u of [author, fresh, poor]) assert.ok(!(await suggest(u, st.short_id, { title: "A better title", tags: same })).ok, "own story, new user and low karma are refused");

  assert.deepEqual(await suggest(b, st.short_id, { title: "A better title", tags: same }), { ok: true, changed: true, applied: false });
  assert.equal((await title()).title, "Original title", "one suggestion is not a quorum");
  // withdrawing: b sends the story's own title back, so d alone is again short of a quorum
  assert.equal((await suggest(b, st.short_id, { title: "Original title", tags: same })).changed, false);
  assert.equal((await suggest(d, st.short_id, { title: "A better title", tags: same })).applied, false);
  assert.equal((await title()).title, "Original title", "a withdrawn suggestion no longer counts");
  assert.ok((await suggest(b, st.short_id, { title: "A better title", tags: same })).applied);
  assert.deepEqual(await title(), { title: "A better title", is_moderated: true });
  const log = (await c.query("SELECT is_from_suggestions, moderator_user_id FROM feed.moderations WHERE story_id = $1", [st.id])).rows;
  assert.deepEqual(log, [{ is_from_suggestions: true, moderator_user_id: null }]);
  assert.ok(!(await suggest(poor, st.short_id, { title: "x yz", tags: same })).ok, "a moderated story takes no more suggestions");

  const st2 = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'Tagged', $2, $3, now(), now()) RETURNING id, short_id", [author.id, (n + "z").slice(-6), "s2" + n])).rows[0];
  await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [st2.id, t1.id]);
  const both = ["one" + n, "two" + n];
  assert.equal((await suggest(b, st2.short_id, { title: "Tagged", tags: both })).applied, false);
  assert.ok((await suggest(d, st2.short_id, { title: "Tagged", tags: both })).applied);
  assert.deepEqual(await c.query("SELECT t.tag FROM feed.taggings g JOIN feed.tags t ON t.id = g.tag_id WHERE g.story_id = $1 ORDER BY t.tag", [st2.id]).then((r) => r.rows.map((x) => x.tag)), both.sort());
  void t2;
});
