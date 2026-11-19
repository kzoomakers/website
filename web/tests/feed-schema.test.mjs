// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("the feed schema is created by startup, holds Lobsters' 36 tables, and enforces case-insensitive usernames", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const c = await conn();
  assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = 'feed'")).rows[0].n, 36);
  const u = `T${Date.now()}`;
  await c.query("INSERT INTO feed.users (username, email, token) VALUES ($1, $2, 'a')", [u, `${u}@example.org`]);
  await assert.rejects(c.query("INSERT INTO feed.users (username, email, token) VALUES ($1, $2, 'b')", [u.toLowerCase(), `x${u}@example.org`]), /duplicate key/);
  const r = await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at) SELECT id, 'x', $1, 'c', now() FROM feed.users WHERE username = $2 RETURNING id", [u.slice(-6), u]);
  await c.query("INSERT INTO feed.story_texts (id, title, body) VALUES ($1, 'Hello makers', 'laser cutting')", [r.rows[0].id]);
  assert.equal((await c.query("SELECT 1 FROM feed.story_texts WHERE tsv @@ plainto_tsquery('english', 'lasers')")).rowCount > 0, true, "stemmed full-text search works");
  await c.query("DELETE FROM feed.story_texts WHERE id = $1", [r.rows[0].id]); await c.query("DELETE FROM feed.stories WHERE id = $1", [r.rows[0].id]); await c.query("DELETE FROM feed.users WHERE username = $1", [u]);
});

// Plan section 2.3: nothing outside the feed's own folders imports from feed/ except the listed glue.
test("only the glue points import from feed/", () => {
  const ok = new Set(["middleware.ts", "lib/db.ts", "app/api/webmaster/feed/route.ts", "app/admin/services/feed/page.tsx", "app/admin/services/feed/feed.tsx"]);
  const root = new URL("..", import.meta.url).pathname;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => ["node_modules", ".next", "tests", "feed", "feed-site"].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []);
  for (const f of walk(root)) if (/from "(@|\.\.?)\/(\.\.\/)*feed\/|import\("\.\.?\/feed\//.test(fs.readFileSync(f, "utf8"))) assert.ok(ok.has(path.relative(root, f)), `${path.relative(root, f)} imports from feed/`);
});

test("comments come back in thread order: best-ranked first, each reply right under its parent", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { storyComments } = await import("../feed/models/story-page.ts");
  const c = await conn(), u = `O${Date.now()}`;
  const uid = (await c.query("INSERT INTO feed.users (username, email, token) VALUES ($1, $2, 'o1') RETURNING id", [u, `${u}@example.org`])).rows[0].id;
  const sid = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at) VALUES ($1, 'x', $2, 'o2', now()) RETURNING id", [uid, u.slice(-6)])).rows[0].id;
  const add = async (short, parent, depth, order) => (await c.query("INSERT INTO feed.comments (short_id, story_id, user_id, parent_comment_id, depth, comment, token, confidence_order, last_edited_at) VALUES ($1,$2,$3,$4,$5,'t',$6,decode($7,'hex'),now()) RETURNING id", [short + u.slice(-5), sid, uid, parent, depth, short + u, order])).rows[0].id;
  const low = await add("a", null, 0, "000002"), high = await add("b", null, 0, "000001");
  await add("c", high, 1, "000009"); await add("d", low, 1, "000001"); await add("e", high, 1, "000003");
  assert.deepEqual((await storyComments([sid])).map((x) => x.short_id[0]), ["b", "e", "c", "a", "d"]);
  await c.query("DELETE FROM feed.comments WHERE story_id = $1", [sid]); await c.query("DELETE FROM feed.stories WHERE id = $1", [sid]); await c.query("DELETE FROM feed.users WHERE id = $1", [uid]);
});
