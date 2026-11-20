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
  assert.equal((await c.query("SELECT is_moderated FROM feed.stories WHERE id = $1", [st.id])).rows[0].is_moderated, true, "stays moderated after a mod undelete");

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

test("inbox lists notifications newest first and marks them read; lists skip hidden stories", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { createComment } = await import("../feed/models/comment-write.ts");
  const { inboxFor } = await import("../feed/models/comments.ts");
  const { listBy, kindQuery } = await import("../feed/models/stories.ts");
  const { markStory } = await import("../feed/models/hide-save.ts");
  const c = await conn(), n = Date.now().toString(36) + "i";
  const mk = async (name) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, created_at) VALUES ($1, $2, $3, 20, now() - interval '200 days') RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`])).rows[0];
  const [a, b] = [await mk("a"), await mk("b")];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at, user_is_following, score) VALUES ($1, 'A story', $2, $3, now(), now(), true, 1) RETURNING id, short_id", [a.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];
  const one = await createComment(b, { storyShortId: st.short_id, comment: "First comment for the inbox" });
  const two = await createComment(b, { storyShortId: st.short_id, comment: "Second comment for the inbox" });
  assert.ok(one.ok && two.ok);
  const u = await inboxFor(a.id, true);
  assert.deepEqual(u.comments.map((x) => x.short_id), [two.shortId, one.shortId]);
  assert.equal((await inboxFor(a.id, true)).comments.length, 0, "listing marked them read");
  const all = await inboxFor(a.id, false);
  assert.equal(all.comments.length, 2); assert.ok(all.comments.every((x) => x.read_at), "they are read now");
  assert.equal((await inboxFor(b.id, false)).comments.length, 0);

  const has = async (viewer) => (await listBy(kindQuery("newest"), 1, viewer)).stories.some((s) => s.short_id === st.short_id);
  assert.ok(await has(a.id) && await has(undefined));
  await markStory(a, st.short_id, "hide");
  assert.ok(!(await has(a.id)), "hidden for a"); assert.ok(await has(b.id) && await has(undefined), "not for others");
});

test("replying and voting on the same comment at once never deadlocks", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { createComment, setCommentDeleted } = await import("../feed/models/comment-write.ts");
  const { castVote } = await import("../feed/models/vote.ts");
  const c = await conn(), n = Date.now().toString(36) + "d";
  const mk = async (name) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, created_at) VALUES ($1, $2, $3, 50, now() - interval '200 days') RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`])).rows[0];
  const a = await mk("a"), voters = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((i) => mk("v" + i)));
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'A story', $2, $3, now(), now()) RETURNING id, short_id", [a.id, n.slice(-6).padStart(6, "x"), "s" + n])).rows[0];
  const top = await createComment(a, { storyShortId: st.short_id, comment: "The comment everyone piles onto" });
  for (let round = 0; round < 5; round++) {
    const jobs = voters.flatMap((v, i) => [
      createComment(v, { storyShortId: st.short_id, parentShortId: top.shortId, comment: `Reply ${round}-${i} from a voter` }),
      castVote(voters[(i + 1) % voters.length], "comment", top.shortId, round % 2 ? 0 : 1),
    ]);
    jobs.push(setCommentDeleted(a, top.shortId, round % 2 === 1));
    await Promise.all(jobs); // any deadlock rejects here
  }
});

test("hidden, saved and upvoted lists hold only the viewer's own marks", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { castVote } = await import("../feed/models/vote.ts");
  const { markStory } = await import("../feed/models/hide-save.ts");
  const { listBy, hiddenBy, savedBy, upvotedBy } = await import("../feed/models/stories.ts");
  const { upvotedComments } = await import("../feed/models/comments.ts");
  const { createComment } = await import("../feed/models/comment-write.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name) => (await c.query(`INSERT INTO feed.users (username, email, token, karma, created_at) VALUES ($1, $2, $3, 20, now() - interval '200 days') RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`])).rows[0];
  const [a, b] = [await mk("la"), await mk("lb")];
  const story = async (i) => (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING id, short_id", [a.id, "List story " + i, n.slice(-4) + "l" + i, "ls" + n + i])).rows[0];
  const [s1, s2] = [await story(1), await story(2)];
  const ids = async (q) => (await listBy(q, 1)).stories.map((s) => s.id);

  assert.ok((await markStory(b, s1.short_id, "hide")).ok); assert.ok((await markStory(b, s2.short_id, "save")).ok);
  assert.deepEqual(await ids(hiddenBy(b.id)), [s1.id]); assert.deepEqual(await ids(savedBy(b.id)), [s2.id]);
  assert.deepEqual(await ids(hiddenBy(a.id)), [], "other users see none of b's marks");

  assert.ok((await castVote(b, "story", s2.short_id, 1)).ok);
  assert.deepEqual(await ids(upvotedBy(b.id)), [s2.id]);
  assert.deepEqual(await ids(upvotedBy(a.id)), [], "own stories never count as upvoted");

  const cm = await createComment(a, { storyShortId: s2.short_id, comment: "A comment b will upvote" });
  assert.ok((await castVote(b, "comment", cm.shortId, 1)).ok);
  assert.deepEqual((await upvotedComments(b.id)).comments.map((x) => x.short_id), [cm.shortId]);
  assert.deepEqual((await upvotedComments(a.id)).comments, []);
});

test("moderation log: filters by moderator and kind, pages", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { listModerations } = await import("../feed/models/moderations.ts");
  const c = await conn(), n = Date.now().toString(36);
  const u = (await c.query(`INSERT INTO feed.users (username, email, token, is_moderator) VALUES ($1, $2, $3, true) RETURNING id`, ["mm" + n, `mm${n}@example.org`, "umm" + n])).rows[0];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at) VALUES ($1, 'Logged story', $2, $3, now()) RETURNING id", [u.id, n.slice(-4) + "mm", "sm" + n])).rows[0];
  await c.query("INSERT INTO feed.moderations (moderator_user_id, story_id, action, reason, token) VALUES ($1, $2, 'deleted story', 'spam', $3), ($1, NULL, 'banned', NULL, $4)", [u.id, st.id, "mt1" + n, "mt2" + n]);
  const mine = (what) => listModerations("mm" + n, what, 1).then((r) => r.rows);
  assert.equal((await mine([])).length, 2);
  const s = await mine(["stories"]); assert.equal(s.length, 1); assert.equal(s[0].story_title, "Logged story"); assert.equal(s[0].reason, "spam");
  assert.equal((await mine(["tags"])).length, 0);
  assert.equal((await listModerations("(Users)", [], 1)).rows.filter((r) => r.moderator === "mm" + n).length, 0);
  assert.ok((await listModerations("(Moderators)", [], 1)).rows.length >= 2);
});

test("moderator merge, unmerge and domain/origin bans are validated and logged", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { modMergeStory, modToggleBan } = await import("../feed/models/mod.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name, mod) => (await c.query(`INSERT INTO feed.users (username, email, token, is_moderator) VALUES ($1, $2, $3, $4) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, mod])).rows[0];
  const [m, u] = [await mk("mgm", true), await mk("mgu", false)];
  const story = async (i) => (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING id, short_id", [u.id, "Merge story " + i, n.slice(-4) + "g" + i, "mg" + n + i])).rows[0];
  const [a, b, d] = [await story(1), await story(2), await story(3)];
  const row = (s) => c.query("SELECT merged_story_id, stories_count, is_moderated FROM feed.stories WHERE id = $1", [s.id]).then((r) => r.rows[0]);

  assert.ok(!(await modMergeStory(u, a.short_id, b.short_id)).ok, "not a moderator");
  assert.ok(!(await modMergeStory(m, a.short_id, a.short_id)).ok, "not into itself");
  assert.ok(!(await modMergeStory(m, a.short_id, "nope00")).ok);
  assert.ok((await modMergeStory(m, a.short_id, b.short_id, "dupe")).ok);
  assert.equal((await row(a)).merged_story_id, b.id); assert.equal((await row(a)).is_moderated, true); assert.equal((await row(b)).stories_count, 1);
  assert.ok(!(await modMergeStory(m, d.short_id, a.short_id)).ok, "no merging into a merged story");
  assert.ok(!(await modMergeStory(m, b.short_id, d.short_id)).ok, "no merging a story others are merged into");
  assert.ok((await modMergeStory(m, a.short_id, "")).ok);
  assert.equal((await row(a)).merged_story_id, null); assert.equal((await row(b)).stories_count, 0);
  const log = (await c.query("SELECT action, reason FROM feed.moderations WHERE story_id = $1 ORDER BY id", [a.id])).rows;
  assert.deepEqual(log.map((r) => r.action), [`merged into ${b.short_id} (Merge story 2)`, "unmerged from another story"]); assert.equal(log[0].reason, "dupe");

  const host = `ban${n}.example.org`;
  assert.ok(!(await modToggleBan(m, "domain", host, "")).ok, "reason required");
  assert.ok(!(await modToggleBan(m, "domain", "not a host", "x")).ok);
  assert.ok(!(await modToggleBan(u, "domain", host, "x")).ok);
  assert.ok((await modToggleBan(m, "domain", host.toUpperCase(), "spam")).ok);
  assert.ok((await modToggleBan(m, "origin", `${host}/blog`, "spam blog")).ok);
  const dom = () => c.query("SELECT banned_at, banned_reason FROM feed.domains WHERE domain = $1", [host]).then((r) => r.rows[0]);
  assert.equal((await dom()).banned_reason, "spam");
  assert.equal((await c.query("SELECT banned_reason FROM feed.origins WHERE identifier = $1", [`${host}/blog`])).rows[0].banned_reason, "spam blog");
  assert.ok((await modToggleBan(m, "domain", host, "relented")).ok); assert.equal((await dom()).banned_at, null, "second call unbans");
  const acts = (await c.query("SELECT m.action FROM feed.moderations m JOIN feed.domains d ON d.id = m.domain_id WHERE d.domain = $1 ORDER BY m.id", [host])).rows.map((r) => r.action);
  assert.deepEqual(acts, ["Banned", "Unbanned"]);
});

test("moderator story edit is logged; user bans end sessions and are logged; mod mail reaches its recipients", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { modUpdateStory } = await import("../feed/models/mod.ts");
  const { modBanUser, modUnbanUser } = await import("../feed/models/mod-users.ts");
  const { createModMail, updateModMail, sendModMailMessage, getModMail, listModMails } = await import("../feed/models/mod-mail.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name, mod = false) => (await c.query(`INSERT INTO feed.users (username, email, token, is_moderator, created_at) VALUES ($1, $2, $3, $4, now() - interval '200 days') RETURNING id, username`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, mod])).rows[0];
  const [m, a, b] = [await mk("em", true), await mk("ea"), await mk("eb")];
  const cat = (await c.query("INSERT INTO feed.categories (category, token) VALUES ($1, $2) RETURNING id", ["ecat" + n, "ec" + n])).rows[0].id;
  const tag = (await c.query("INSERT INTO feed.tags (tag, category_id, token, hotness_mod) VALUES ($1, $2, $3, 0) RETURNING id, tag", ["etg" + n, cat, "et" + n])).rows[0];
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at, description, markeddown_description, user_is_author) VALUES ($1, 'Old title', $2, $3, now(), now(), 'text', '<p>text</p>', true) RETURNING id, short_id", [a.id, n.slice(-4) + "ed", "ed" + n])).rows[0];
  await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [st.id, tag.id]);

  // moderator edit
  const input = { title: "New title", url: "", description: "text", tags: [tag.tag], userIsAuthor: false };
  assert.ok(!(await modUpdateStory(a, st.short_id, input)).ok, "not a moderator");
  assert.ok((await modUpdateStory(m, st.short_id, input, "clearer")).ok);
  const row = (await c.query("SELECT title, is_moderated FROM feed.stories WHERE id = $1", [st.id])).rows[0];
  assert.deepEqual(row, { title: "New title", is_moderated: true });
  const lg = (await c.query("SELECT action, reason FROM feed.moderations WHERE story_id = $1", [st.id])).rows;
  assert.deepEqual(lg, [{ action: 'changed title from "Old title" to "New title"', reason: "clearer" }]);
  assert.ok(!(await modUpdateStory(m, st.short_id, { ...input, tags: ["no-such-tag"] })).ok, "unknown tag refused");

  // ban
  await c.query("INSERT INTO feed.invitations (user_id, code, token) VALUES ($1, 'c', $2)", [b.id, "inv" + n]);
  assert.ok(!(await modBanUser(a, b.username, "x")).ok, "not a moderator");
  assert.ok(!(await modBanUser(m, b.username, "  ")).ok, "reason required");
  assert.ok(!(await modBanUser(m, m.username, "x")).ok, "not yourself");
  assert.ok(!(await modBanUser(m, "nobody" + n, "x")).ok);
  const ver = (await c.query("SELECT session_version v FROM feed.users WHERE id = $1", [b.id])).rows[0].v;
  assert.ok((await modBanUser(m, b.username, "spamming")).ok);
  const bu = (await c.query("SELECT banned_at, banned_reason, deleted_at, session_version v FROM feed.users WHERE id = $1", [b.id])).rows[0];
  assert.ok(bu.banned_at && bu.deleted_at); assert.equal(bu.banned_reason, "spamming"); assert.equal(bu.v, ver + 1, "sessions end");
  assert.ok((await c.query("SELECT used_at FROM feed.invitations WHERE user_id = $1", [b.id])).rows[0].used_at, "invitations voided");
  assert.ok((await modUnbanUser(m, b.username, "appealed")).ok);
  assert.deepEqual((await c.query("SELECT banned_at, deleted_at FROM feed.users WHERE id = $1", [b.id])).rows[0], { banned_at: null, deleted_at: null });
  assert.deepEqual((await c.query("SELECT action FROM feed.moderations WHERE user_id = $1 ORDER BY id", [b.id])).rows.map((r) => r.action), ["Banned", "Unbanned"]);

  // mod mail
  const mv = { id: m.id, isModerator: true }, bv = { id: b.id, isModerator: false }, av = { id: a.id, isModerator: false };
  assert.ok(!(await createModMail(a, { subject: "s", recipients: b.username, commentRefs: "", storyRefs: "" })).ok, "moderators only");
  assert.ok(!(await createModMail(m, { subject: "", recipients: b.username, commentRefs: "", storyRefs: "" })).ok);
  assert.ok(!(await createModMail(m, { subject: "s", recipients: "ghost" + n, commentRefs: "", storyRefs: "" })).ok, "unknown recipient");
  const mail = await createModMail(m, { subject: "About your story", recipients: b.username, commentRefs: "", storyRefs: st.short_id });
  assert.ok(mail.ok);
  assert.ok(!(await sendModMailMessage(m, mail.shortId, "too short")).ok);
  assert.ok(!(await sendModMailMessage(a, mail.shortId, "I am not a recipient of this mail.")).ok);
  assert.ok((await sendModMailMessage(m, mail.shortId, "Please read the topicality guideline.")).ok);
  assert.equal((await listModMails(bv))[0].unread, 1);
  assert.equal((await listModMails(av)).length, 0, "non-recipients see nothing");
  assert.equal(await getModMail(mail.shortId, av), null);
  const page = await getModMail(mail.shortId, bv);
  assert.equal(page.messages.length, 1); assert.deepEqual(page.storyRefs.map((s) => s.short_id), [st.short_id]);
  assert.equal((await listModMails(bv))[0].unread, 0, "opening marks read");
  assert.ok((await sendModMailMessage(b, mail.shortId, "Thanks, I will fix it right away.")).ok);
  assert.equal((await listModMails(mv))[0].unread, 0, "a moderator who is not a recipient is not notified, though the thread is theirs to read");
  assert.ok((await updateModMail(m, mail.shortId, { subject: "Renamed", recipients: `${b.username} ${a.username}`, commentRefs: "", storyRefs: "" })).ok);
  assert.equal((await listModMails(av))[0].subject, "Renamed");
});

test("mod notes: moderators add them, automatic ones skip repeats and show no moderator", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { addModNote, tattle, notesFor } = await import("../feed/models/mod-notes.ts");
  const { modToggleBan } = await import("../feed/models/mod.ts");
  const { createStory } = await import("../feed/models/submit.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name, mod = false) => (await c.query(`INSERT INTO feed.users (username, email, token, is_moderator, karma, created_at) VALUES ($1, $2, $3, $4, 20, now() - interval '200 days') RETURNING id, username`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, mod])).rows[0];
  const [m, u] = [await mk("nm", true), await mk("nu")];
  assert.ok(!(await addModNote(u, u.username, "I am not a moderator")).ok);
  assert.ok(!(await addModNote(m, u.username, "   ")).ok, "blank");
  assert.ok(!(await addModNote(m, "ghost" + n, "who?")).ok, "unknown user");
  assert.ok((await addModNote(m, u.username, "Talked to them about *tone*.")).ok);
  await tattle(u.id, "Attempted to log in while banned."); await tattle(u.id, "Attempted to log in while banned.");
  const notes = await notesFor(u.id);
  assert.equal(notes.length, 2, "the repeated automatic note is written once");
  assert.equal(notes[0].moderator, null); assert.equal(notes[1].moderator, m.username);
  assert.match(notes[1].markeddown_note, /<em>tone<\/em>/);

  const cat = (await c.query("INSERT INTO feed.categories (category, token) VALUES ($1, $2) RETURNING id", ["ncat" + n, "nc" + n])).rows[0].id;
  const tag = (await c.query("INSERT INTO feed.tags (tag, category_id, token, hotness_mod) VALUES ($1, $2, $3, 0) RETURNING tag", ["ntg" + n, cat, "nt" + n])).rows[0];
  const host = `note${n}.example.org`;
  assert.ok((await modToggleBan(m, "domain", host, "spam")).ok);
  const r = await createStory(u, { title: "Banned site story", url: `https://${host}/x`, description: "", tags: [tag.tag], userIsAuthor: false });
  assert.ok(!r.ok);
  await new Promise((res) => setTimeout(res, 300)); // the note is written in the background
  assert.ok((await notesFor(u.id)).some((x) => /banned domain/.test(x.markeddown_note) && x.moderator === null));
});

test("invitations: who may send, limits, one address one code, requests queue", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { saveFeedConfig } = await import("../feed/config.ts");
  const { inviteRights, createInvitation, liveInvitation, sentInvitations, requestInvitation, confirmRequest, requestsAccess, listRequests, sendForRequest, deleteRequest } = await import("../feed/models/invitations.ts");
  const { modSetInvites } = await import("../feed/models/mod-users.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name, o = {}) => (await c.query(`INSERT INTO feed.users (username, email, token, kind, is_moderator, karma, created_at, email_verified_at) VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 || ' days')::interval, now()) RETURNING id, username`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, o.kind ?? "external", !!o.mod, o.karma ?? 5, String(o.age ?? 200)])).rows[0];
  const [mod, old, fresh, member] = [await mk("im", { mod: true }), await mk("io"), await mk("if", { age: 1 }), await mk("imb", { kind: "member", age: 1 })];
  try {
    await saveFeedConfig({ enabled: true, signup: "invite", invites: { who: "members+trusted", perUserLimit: 2, expiryDays: 14, requests: true } }, "test");
    assert.ok((await inviteRights(old.id)).ok, "an established external user may");
    assert.ok(!(await inviteRights(fresh.id)).ok, "a new external user may not");
    assert.ok((await inviteRights(member.id)).ok, "members are trusted at once");
    await saveFeedConfig({ enabled: true, invites: { who: "staff", perUserLimit: 2 } }, "test");
    assert.ok(!(await inviteRights(old.id)).ok); assert.ok((await inviteRights(mod.id)).staff);
    await saveFeedConfig({ enabled: true, invites: { who: "members+trusted", perUserLimit: 2, expiryDays: 14, requests: true } }, "test");

    assert.ok(!(await createInvitation(old.id, "not an address", "")).ok);
    const a = `a${n}@example.net`, b = `b${n}@example.net`;
    assert.ok((await createInvitation(old.id, `  ${a.toUpperCase()} `, "welcome")).ok);
    assert.ok(!(await createInvitation(old.id, a, "")).ok, "already invited");
    assert.ok(!(await createInvitation(old.id, `io${n}@example.org`, "")).ok, "already has an account");
    assert.ok((await createInvitation(old.id, b, "")).ok);
    assert.ok(!(await createInvitation(old.id, `c${n}@example.net`, "")).ok, "limit of 2 waiting");
    assert.ok((await createInvitation(mod.id, `d${n}@example.net`, "")).ok, "staff are not limited");
    const sent = await sentInvitations(old.id); assert.equal(sent.length, 2);
    const code = (await c.query("SELECT code FROM feed.invitations WHERE user_id = $1 AND email = $2", [old.id, a])).rows[0].code;
    assert.equal((await liveInvitation(code)).email, a); assert.equal(await liveInvitation("nope" + n), null);
    await c.query("UPDATE feed.invitations SET created_at = now() - interval '30 days' WHERE code = $1", [code]);
    assert.equal(await liveInvitation(code), null, "expired");
    assert.ok((await inviteRights(old.id)).ok, "an expired code no longer counts against the limit");

    // a moderator turns invitations off, and says why
    assert.ok(!(await modSetInvites(mod, old.username, true, "")).ok, "reason required");
    assert.ok((await modSetInvites(mod, old.username, true, "sent to strangers")).ok);
    assert.match((await inviteRights(old.id)).why, /sent to strangers/);
    assert.ok((await modSetInvites(mod, old.username, false)).ok); assert.ok((await inviteRights(old.id)).ok);
    assert.deepEqual((await c.query("SELECT action FROM feed.moderations WHERE user_id = $1 ORDER BY id", [old.id])).rows.map((r) => r.action), ["Disabled invitations and suggestions", "Enabled invitations"]);

    // public requests: unconfirmed ones stay hidden
    const r = `r${n}@example.net`;
    assert.ok(!(await requestInvitation("1.2.3.4", "Rae", r, "javascript:alert(1)")).ok, "only http(s) links");
    assert.ok((await requestInvitation("1.2.3.4", "Rae", r, "https://example.net/rae")).ok);
    assert.equal((await listRequests()).filter((x) => x.email === r).length, 0, "not shown until confirmed");
    const rc = (await c.query("SELECT code FROM feed.invitation_requests WHERE email = $1", [r])).rows[0].code;
    assert.ok(await confirmRequest(rc)); assert.ok(!(await confirmRequest("nope" + n)));
    assert.equal((await listRequests()).filter((x) => x.email === r).length, 1);
    assert.ok(!(await requestsAccess(fresh.id)).ok); assert.ok((await requestsAccess(mod.id)).moderator);
    assert.ok(!(await deleteRequest(fresh.id, rc)).ok, "not allowed to see the queue");
    const sr = await sendForRequest(mod.id, rc); assert.ok(sr.ok, JSON.stringify(sr)); assert.equal(sr.name, "Rae");
    assert.equal((await listRequests()).filter((x) => x.email === r).length, 0, "a sent request leaves the queue");
    assert.equal((await c.query("SELECT 1 FROM feed.invitations WHERE email = $1", [r])).rowCount, 1);

    const { listUsers } = await import("../feed/models/user-list.ts");
    const mods = (await listUsers("moderators")).map((u) => u.username);
    assert.ok(mods.includes(mod.username) && !mods.includes(old.username), "moderators list");
    assert.ok(!(await listUsers("tree")).some((u) => u.username === "inactive-user"), "the system account is never listed");
  } finally { await saveFeedConfig({ enabled: false }, "test"); }
});
