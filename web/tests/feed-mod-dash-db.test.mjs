// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("/mod dashboard: flagged comments, flagged commenters, activity feed", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { flaggedComments, flaggedCommenters, modActivity } = await import("../feed/models/mod-dash.ts");
  const c = await conn(), n = Date.now().toString(36);
  const mk = async (name) => (await c.query(`INSERT INTO feed.users (username, email, token) VALUES ($1, $2, $3) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`])).rows[0];
  const [bad, ok, v1, v2, v3] = [await mk("bad"), await mk("ok"), await mk("v1"), await mk("v2"), await mk("v3")];
  const story = async (i) => (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at) VALUES ($1, 'S', $2, $3, now()) RETURNING id", [ok.id, n.slice(-5) + i, `s${i}${n}`])).rows[0];
  const [s1, s2] = [await story(1), await story(2)];
  const cm = async (u, s, i, flags) => (await c.query("INSERT INTO feed.comments (story_id, user_id, comment, markeddown_comment, short_id, token, flags, last_edited_at) VALUES ($1, $2, 'x', 'x', $3, $4, $5, now()) RETURNING id, short_id", [s.id, u.id, n.slice(-5) + i, `c${i}${n}`, flags])).rows[0];
  const flagged = [];
  for (let i = 0; i < 5; i++) flagged.push(await cm(bad, i % 2 ? s1 : s2, `b${i}`, 2));
  await cm(ok, s1, "ok1", 0);
  // three real flag votes make the first comment mod_flagged; the second has the flag count but only moderator votes
  for (const v of [v1, v2, v3]) await c.query("INSERT INTO feed.votes (user_id, story_id, comment_id, vote, reason) VALUES ($1, $2, $3, -1, 'T')", [v.id, s2.id, flagged[0].id]);
  for (const v of [v1, v2, v3]) await c.query("INSERT INTO feed.votes (user_id, story_id, comment_id, vote, reason) VALUES ($1, $2, $3, -1, 'M')", [v.id, s1.id, flagged[1].id]);

  const ids = (await flaggedComments("1d", 1)).comments.map((x) => x.short_id);
  assert.ok(ids.includes(flagged[0].short_id), "flags >= 2 and 3 non-mod flag votes");
  assert.ok(!ids.includes(flagged[1].short_id), "moderator flag votes don't count");

  const { agg, commenters } = await flaggedCommenters("1m");
  assert.ok(agg.n_commenters >= 2 && agg.stddev > 0);
  const me = commenters.find((u) => u.username === "bad" + n);
  assert.ok(me, "5 flagged comments over 2 stories, 10 flags, all of their comments");
  assert.equal(me.n_comments, 5); assert.equal(me.n_flags, 10); assert.equal(Math.round(me.percent_flagged), 100);
  assert.ok(me.sigma > 0);
  assert.ok(!commenters.some((u) => u.username === "ok" + n));

  const m = (await c.query(`INSERT INTO feed.moderations (moderator_user_id, user_id, action, reason, token) VALUES ($1, $1, 'Banned', 'why', $2) RETURNING id`, [ok.id, "ma" + n])).rows[0];
  await c.query("INSERT INTO feed.mod_notes (moderator_user_id, user_id, note, markeddown_note, token) VALUES ($1, $2, 'n', '<p>n</p>', $3)", [ok.id, bad.id, "mn" + n]);
  const mail = (await c.query("INSERT INTO feed.mod_mails (subject, short_id) VALUES ('Hello', $1) RETURNING id", [n.slice(-6) + "m"])).rows[0];
  await c.query("INSERT INTO feed.mod_mail_recipients (mod_mail_id, user_id) VALUES ($1, $2)", [mail.id, bad.id]);
  const act = await modActivity();
  assert.ok(act.some((a) => a.kind === "moderation" && a.m.id === m.id));
  assert.ok(act.some((a) => a.kind === "note" && a.user === "bad" + n && a.moderator === "ok" + n));
  const ml = act.find((a) => a.kind === "mail" && a.subject === "Hello" && a.recipients.includes("bad" + n));
  assert.ok(ml && ml.messages === 0);
  assert.ok(act.every((a, i) => i === 0 || act[i - 1].at >= a.at), "newest first");
});
