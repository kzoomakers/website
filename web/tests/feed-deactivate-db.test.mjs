// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("deactivate: password and checkbox, cleanup, disown, sessions end", { skip }, async () => {
  const { conn } = await import("../lib/db.ts"), { hashPassword } = await import("../feed/auth.ts");
  const { deactivate } = await import("../feed/models/deactivate.ts"), { createComment } = await import("../feed/models/comment-write.ts"), { sendMessage, listMessages } = await import("../feed/models/messages.ts");
  const c = await conn(), n = Date.now().toString(36).slice(-8);
  const mk = async (name, kind, karma = 0) => (await c.query(`INSERT INTO feed.users (username, email, token, kind, password_digest, karma, created_at) VALUES ($1, $2, $3, $4, $5, $6, now() - interval '200 days') RETURNING id`,
    [name + n, `${name}${n}@example.org`, `u${name}${n}`, kind, kind === "external" ? await hashPassword("old password 123") : null, karma])).rows[0];
  const leaver = await mk("leaver", "external"), other = await mk("other", "external"), member = await mk("member", "member"), bad = await mk("bad", "external", -5);
  const st = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at, created_at) VALUES ($1, 'Mine', $2, $3, now(), now()) RETURNING id, short_id", [leaver.id, n.slice(-6).padStart(6, "y"), "s" + n])).rows[0];
  const good = await createComment(leaver, { storyShortId: st.short_id, comment: "a perfectly fine comment from me" });
  const down = await createComment(leaver, { storyShortId: st.short_id, comment: "a comment that got downvoted hard" });
  await c.query("UPDATE feed.comments SET score = -3 WHERE short_id = $1", [down.shortId]); // recalc keeps votes-derived score, so mark via votes below
  await c.query("INSERT INTO feed.votes (user_id, story_id, comment_id, vote) SELECT $1, story_id, id, -1 FROM feed.comments WHERE short_id = $2", [other.id, down.shortId]);
  await c.query("INSERT INTO feed.invitations (user_id, code, token) VALUES ($1, $2, $2)", [leaver.id, "inv" + n]);
  await sendMessage(leaver, { to: "other" + n, subject: "s", body: "hello there", modNote: false });
  await sendMessage(other, { to: "leaver" + n, subject: "r", body: "hello back", modNote: false });

  const D = (u, o = {}) => deactivate(Number(u.id), { password: "old password 123", sure: true, disown: false, ...o });
  assert.match((await D(member)).error, /main site/);
  assert.match((await D(leaver, { sure: false })).error, /I am sure/);
  assert.match((await D(leaver, { password: "wrong password" })).error, /password/);
  assert.equal((await c.query("SELECT deleted_at FROM feed.users WHERE id = $1", [leaver.id])).rows[0].deleted_at, null);

  const ver = (await c.query("SELECT session_version v FROM feed.users WHERE id = $1", [leaver.id])).rows[0].v;
  const r = await D(leaver, { disown: true });
  assert.ok(r.ok && r.disowned);
  const u = (await c.query("SELECT deleted_at, session_version v, email FROM feed.users WHERE id = $1", [leaver.id])).rows[0];
  assert.ok(u.deleted_at); assert.equal(u.v, ver + 1, "other sessions end"); assert.equal(u.email, `leaver${n}@example.org`, "a clean exit keeps the address");
  assert.ok((await c.query("SELECT is_deleted FROM feed.comments WHERE short_id = $1", [down.shortId])).rows[0].is_deleted, "negative comment deleted");
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.comments WHERE short_id = $1 AND user_id = $2", [down.shortId, leaver.id])).rows[0].n, 1, "deleted things keep their author");
  const sys = (await c.query("SELECT id FROM feed.users WHERE lower(username) = 'inactive-user'")).rows[0].id;
  assert.equal((await c.query("SELECT user_id FROM feed.comments WHERE short_id = $1", [good.shortId])).rows[0].user_id, sys, "live comment disowned");
  assert.equal((await c.query("SELECT user_id FROM feed.stories WHERE id = $1", [st.id])).rows[0].user_id, sys, "story disowned");
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.invitations WHERE user_id = $1 AND used_at IS NULL", [leaver.id])).rows[0].n, 0);
  assert.equal((await listMessages(Number(leaver.id), "in")).length + (await listMessages(Number(leaver.id), "out")).length, 0, "their messages are gone");
  assert.equal((await listMessages(Number(other.id), "in")).length, 1, "the recipient keeps theirs");
  assert.deepEqual((await c.query("SELECT action FROM feed.moderations WHERE user_id = $1", [leaver.id])).rows, [{ action: "deactivated, disowning their stories and comments" }]);
  assert.match((await D(leaver)).error, /not permitted/, "can't do it twice");

  assert.ok((await D(bad)).ok);
  assert.equal((await c.query("SELECT email FROM feed.users WHERE id = $1", [bad.id])).rows[0].email, `bad${n}@talk.invalid`, "negative karma loses the address");
});
