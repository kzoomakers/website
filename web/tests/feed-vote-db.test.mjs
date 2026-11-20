// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("votes: upvote, flag rules, karma, score and hotness, unvote", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { castVote } = await import("../feed/models/vote.ts");
  const { createComment } = await import("../feed/models/comment-write.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name, age = 200, karma = 20) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, created_at) VALUES ($1, $2, $3, $4, now() - ($5 || ' days')::interval) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, karma, age])).rows[0];
  const [a, b, d, fresh, poor] = [await mk("a"), await mk("b"), await mk("d"), await mk("f", 1), await mk("p", 200, 0)];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'A story', $2, $3, now(), now()) RETURNING id, short_id", [a.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];
  const story = () => c.query("SELECT score, flags FROM feed.stories WHERE id = $1", [st.id]).then((r) => r.rows[0]);
  const karma = (u) => c.query("SELECT karma FROM feed.users WHERE id = $1", [u.id]).then((r) => r.rows[0].karma);

  assert.ok((await castVote(b, "story", st.short_id, 1)).ok);
  assert.equal((await story()).score, 1); assert.equal(await karma(a), 21);
  assert.ok((await castVote(b, "story", st.short_id, 1)).ok); assert.equal(await karma(a), 21, "repeat is a no-op");
  assert.ok((await castVote(b, "story", st.short_id, 0)).ok); assert.equal(await karma(a), 20);
  assert.ok(!(await castVote(b, "story", st.short_id, -1, "X")).ok, "bad reason");
  assert.ok(!(await castVote(fresh, "story", st.short_id, -1, "S")).ok, "new users can't flag");
  assert.ok(!(await castVote(a, "story", st.short_id, -1, "S")).ok, "not your own");
  assert.ok((await castVote(b, "story", st.short_id, -1, "S")).ok);
  assert.deepEqual(await story(), { score: -1, flags: 1 }, "a flag sums as -1 and is counted in flags");
  assert.equal((await c.query("SELECT 1 FROM feed.hidden_stories WHERE user_id = $1 AND story_id = $2", [b.id, st.id])).rowCount, 1, "flagging hides");
  assert.ok((await castVote(b, "story", st.short_id, 1)).ok); assert.deepEqual(await story(), { score: 1, flags: 0 }, "flag to upvote");

  // comments: karma gate, replier can't flag, score moves with the votes
  const cm = await createComment(a, { storyShortId: st.short_id, comment: "A comment worth voting on" });
  const row = () => c.query("SELECT score, flags FROM feed.comments WHERE short_id = $1", [cm.shortId]).then((r) => r.rows[0]);
  assert.ok((await castVote(b, "comment", cm.shortId, 1)).ok); assert.equal((await row()).score, 2);
  assert.ok(!(await castVote(poor, "comment", cm.shortId, -1, "T")).ok, "comment flags need karma");
  assert.ok(!(await castVote(d, "comment", cm.shortId, -1, "Z")).ok);
  assert.ok((await castVote(d, "comment", cm.shortId, -1, "T")).ok); assert.deepEqual(await row(), { score: 1, flags: 1 });
  const rep = await createComment(b, { storyShortId: st.short_id, parentShortId: cm.shortId, comment: "A reply from voter b" });
  assert.ok(rep.ok);
  assert.ok(!(await castVote(b, "comment", cm.shortId, -1, "T")).ok, "can't flag what you replied to");
  assert.ok((await castVote(d, "comment", cm.shortId, 0)).ok); assert.deepEqual(await row(), { score: 2, flags: 0 });

  // a commenter's flag on the story doesn't count
  assert.ok((await castVote(b, "story", st.short_id, -1, "O")).ok);
  assert.equal((await story()).flags, 0, "b commented, so b's flag is ignored");
  assert.ok(!(await castVote(b, "story", "zzzzzz", 1)).ok);
});

test("hide and save: idempotent, unhide takes back your flag", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { castVote } = await import("../feed/models/vote.ts");
  const { markStory } = await import("../feed/models/hide-save.ts");
  const c = await conn(), n = Date.now().toString(36) + "h";
  const mk = async (name) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, created_at) VALUES ($1, $2, $3, 20, now() - interval '200 days') RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`])).rows[0];
  const [a, b] = [await mk("a"), await mk("b")];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'A story', $2, $3, now(), now()) RETURNING id, short_id", [a.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];
  const count = (t) => c.query(`SELECT count(*)::int n FROM feed.${t} WHERE user_id = $1 AND story_id = $2`, [b.id, st.id]).then((r) => r.rows[0].n);
  assert.ok((await markStory(b, st.short_id, "save")).ok); assert.ok((await markStory(b, st.short_id, "save")).ok);
  assert.equal(await count("saved_stories"), 1);
  assert.ok((await markStory(b, st.short_id, "unsave")).ok); assert.equal(await count("saved_stories"), 0);
  assert.ok((await castVote(b, "story", st.short_id, -1, "S")).ok);
  assert.equal(await count("hidden_stories"), 1); assert.equal((await c.query("SELECT flags FROM feed.stories WHERE id = $1", [st.id])).rows[0].flags, 1);
  assert.ok((await markStory(b, st.short_id, "unhide")).ok);
  assert.equal(await count("hidden_stories"), 0); assert.equal((await c.query("SELECT flags FROM feed.stories WHERE id = $1", [st.id])).rows[0].flags, 0, "flag withdrawn");
  await c.query("UPDATE feed.stories SET merged_story_id = $1 WHERE id = $1", [st.id]);
  assert.ok(!(await markStory(b, st.short_id, "hide")).ok, "merged stories can't be hidden");
  assert.ok(!(await markStory(b, "zzzzzz", "hide")).ok);
});

test("notifications: reply, mention, follow, hidden, read-on-create", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { createComment } = await import("../feed/models/comment-write.ts");
  const { markStory } = await import("../feed/models/hide-save.ts");
  const c = await conn(), n = Date.now().toString(36) + "n";
  const mk = async (name, settings = {}) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, settings, created_at) VALUES ($1, $2, $3, 20, $4, now() - interval '200 days') RETURNING id, username`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, settings])).rows[0];
  const [a, b, d, e, h] = [await mk("a"), await mk("b"), await mk("d"), await mk("e", { inbox_mentions: false }), await mk("h")];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at, user_is_following) VALUES ($1, 'A story', $2, $3, now(), now(), true) RETURNING id, short_id", [a.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];
  const rows = (cid) => c.query("SELECT user_id, read_at FROM feed.notifications WHERE notifiable_id = $1", [cid]).then((r) => r.rows);
  const top = await createComment(b, { storyShortId: st.short_id, comment: `A top level comment mentioning @${d.username} and @${e.username} and @${h.username}` });
  await markStory(h, st.short_id, "hide");
  const t = (await c.query("SELECT id FROM feed.comments WHERE short_id = $1", [top.shortId])).rows[0];
  // h hid the story after the comment: its row already exists; check the others now
  const by = Object.fromEntries((await rows(t.id)).map((r) => [r.user_id, r.read_at]));
  assert.equal(by[a.id], null, "story follower is notified, unread");
  assert.equal(by[d.id], null, "mentioned user, unread");
  assert.ok(by[e.id], "inbox_mentions off: created already read");
  assert.ok(!(b.id in by), "never the commenter");
  const rep = await createComment(d, { storyShortId: st.short_id, parentShortId: top.shortId, comment: `Replying and mentioning @${b.username} again` });
  const rid = (await c.query("SELECT id FROM feed.comments WHERE short_id = $1", [rep.shortId])).rows[0].id;
  const r2 = await rows(rid);
  assert.equal(r2.filter((r) => r.user_id === b.id).length, 1, "replied-to and mentioned: one row");
  const r3 = await createComment(e, { storyShortId: st.short_id, parentShortId: top.shortId, comment: "Another reply from e, hidden by h" });
  assert.ok(!(await rows((await c.query("SELECT id FROM feed.comments WHERE short_id = $1", [r3.shortId])).rows[0].id)).some((r) => r.user_id === h.id), "hiders get none");
});

test("moderator delete and undelete write the mod log", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { modSetStoryDeleted, modSetCommentDeleted } = await import("../feed/models/mod.ts");
  const { createComment, setCommentDeleted } = await import("../feed/models/comment-write.ts");
  const { castVote } = await import("../feed/models/vote.ts");
  const c = await conn(), n = Date.now().toString(36) + "m";
  const mk = async (name, m = false) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, is_moderator, created_at) VALUES ($1, $2, $3, 20, $4, now() - interval '200 days') RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, m])).rows[0];
  const [a, b, m] = [await mk("a"), await mk("b"), await mk("m", true)];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'A story', $2, $3, now(), now()) RETURNING id, short_id", [a.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];
  const logs = (col, id) => c.query(`SELECT action, reason, moderator_user_id FROM feed.moderations WHERE ${col} = $1 ORDER BY id`, [id]).then((r) => r.rows);
  assert.ok(!(await modSetStoryDeleted(b, st.short_id, true, "nope")).ok, "only moderators");
  assert.ok((await modSetStoryDeleted(m, st.short_id, true, "spam")).ok);
  let s = (await c.query("SELECT is_deleted, is_moderated FROM feed.stories WHERE id = $1", [st.id])).rows[0];
  assert.deepEqual(s, { is_deleted: true, is_moderated: true });
  assert.deepEqual(await logs("story_id", st.id), [{ action: "deleted story", reason: "spam", moderator_user_id: m.id }]);
  assert.ok((await modSetStoryDeleted(m, st.short_id, true, "again")).ok); assert.equal((await logs("story_id", st.id)).length, 1, "no change, no log");
  assert.ok((await modSetStoryDeleted(m, st.short_id, false)).ok);
  assert.equal((await logs("story_id", st.id)).at(-1).action, "undeleted story");

  const cm = await createComment(b, { storyShortId: st.short_id, comment: "A comment the mod will remove" });
  assert.ok((await castVote(a, "comment", cm.shortId, 1)).ok);
  const bKarma = () => c.query("SELECT karma FROM feed.users WHERE id = $1", [b.id]).then((r) => r.rows[0].karma);
  const before = await bKarma(); // 20 + 1 from a's vote
  assert.ok((await modSetCommentDeleted(m, cm.shortId, true, "rude")).ok);
  const cr = (await c.query("SELECT id, is_deleted, is_moderated, confidence FROM feed.comments WHERE short_id = $1", [cm.shortId])).rows[0];
  assert.ok(cr.is_deleted && cr.is_moderated && Number(cr.confidence) === 0);
  assert.equal(await bKarma(), before - 4, "2 per vote row (own upvote and a's)");
  assert.deepEqual((await logs("comment_id", cr.id))[0], { action: "deleted comment", reason: "rude", moderator_user_id: m.id });
  assert.ok(!(await setCommentDeleted(b, cm.shortId, false)).ok, "author can't undo a mod delete");
  assert.ok((await modSetCommentDeleted(m, cm.shortId, false)).ok);
  assert.equal((await c.query("SELECT is_moderated FROM feed.comments WHERE id = $1", [cr.id])).rows[0].is_moderated, false);
  assert.equal((await logs("comment_id", cr.id)).at(-1).action, "undeleted comment");
});
