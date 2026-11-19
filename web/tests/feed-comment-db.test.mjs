// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("comments: threading, own upvote, counts, duplicates, rules, speed limit, edit and delete", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { createComment, updateComment, setCommentDeleted } = await import("../feed/models/comment-write.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name) => (await c.query(`INSERT INTO feed.users (username, email, token, created_at) VALUES ($1, $2, $3, now() - interval '200 days') RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`])).rows[0];
  const [a, b] = [await mk("a"), await mk("b")];
  const cat = (await c.query("INSERT INTO feed.categories (category, token) VALUES ($1, $2) RETURNING id", ["cat" + n, "c" + n])).rows[0].id;
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'A story', $2, $3, now(), now()) RETURNING id, short_id", [a.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];

  const top = await createComment(b, { storyShortId: st.short_id, comment: "A first top-level comment with @a" + n });
  assert.ok(top.ok, JSON.stringify(top));
  const row = (id) => c.query("SELECT * FROM feed.comments WHERE short_id = $1", [id]).then((r) => r.rows[0]);
  const t = await row(top.shortId);
  assert.equal(t.depth, 0); assert.equal(t.score, 1); assert.ok(t.thread_id > 0); assert.match(t.markeddown_comment, /href="\/~a/);
  assert.equal((await c.query("SELECT comments_count FROM feed.stories WHERE id = $1", [st.id])).rows[0].comments_count, 1);
  assert.deepEqual((await createComment(b, { storyShortId: st.short_id, comment: "A first top-level comment with @a" + n })).shortId, top.shortId, "an exact repeat is returned, not duplicated");

  const reply = await createComment(a, { storyShortId: st.short_id, parentShortId: top.shortId, comment: "A reply from the story's author" });
  assert.ok(reply.ok, JSON.stringify(reply));
  const r1 = await row(reply.shortId);
  assert.equal(r1.depth, 1); assert.equal(r1.thread_id, t.thread_id); assert.equal((await row(top.shortId)).reply_count, 1);
  const again = await createComment(a, { storyShortId: st.short_id, parentShortId: top.shortId, comment: "A second quick reply in the thread" });
  assert.ok(!again.ok && /speed limit/.test(again.errors[0]), JSON.stringify(again));
  assert.ok(!(await createComment(a, { storyShortId: st.short_id, comment: "+1" })).ok, "canned rule");
  assert.ok(!(await createComment(a, { storyShortId: st.short_id, parentShortId: "nope", comment: "Valid text here" })).ok, "unknown parent");
  assert.ok(!(await createComment(a, { storyShortId: "zzzzzz", comment: "Valid text here" })).ok, "unknown story");

  // depth limit
  await c.query("UPDATE feed.comments SET depth = 18 WHERE short_id = $1", [reply.shortId]);
  const deep = await createComment(b, { storyShortId: st.short_id, parentShortId: reply.shortId, comment: "Replying far too deep" });
  assert.ok(!deep.ok && /too deep/.test(deep.errors[0]), JSON.stringify(deep));

  // edit and delete
  assert.ok((await updateComment(b, top.shortId, "An edited top-level comment")).ok);
  assert.match((await row(top.shortId)).markeddown_comment, /edited/);
  assert.ok(!(await updateComment(a, top.shortId, "Not yours to edit")).ok);
  await c.query("UPDATE feed.comments SET last_edited_at = now() - interval '7 hours' WHERE short_id = $1", [top.shortId]);
  assert.ok(!(await updateComment(b, top.shortId, "Too late for an edit")).ok);
  assert.ok((await setCommentDeleted(b, top.shortId, true)).ok);
  const d = await row(top.shortId);
  assert.equal(d.is_deleted, true); assert.equal(Number(d.confidence), 0);
  assert.equal((await c.query("SELECT comments_count FROM feed.stories WHERE id = $1", [st.id])).rows[0].comments_count, 1, "only the live reply counts now");
  assert.ok((await setCommentDeleted(b, top.shortId, false)).ok);
  assert.ok(Number((await row(top.shortId)).confidence) > 0, "undelete restores sort position");
  assert.ok(!(await setCommentDeleted(a, top.shortId, true)).ok, "only the author");
  await c.query("UPDATE feed.comments SET created_at = now() - interval '15 days' WHERE short_id = $1", [top.shortId]);
  assert.ok(!(await setCommentDeleted(b, top.shortId, true)).ok, "delete window is 14 days");
});
