// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("messages: send, read, keep as new, per-side delete, mod note", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const M = await import("../feed/models/messages.ts");
  const c = await conn(), n = Date.now().toString(36).slice(-8);
  const mk = async (name, mod) => (await c.query(`INSERT INTO feed.users (username, email, token, is_moderator) VALUES ($1, $2, $3, $4) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, mod])).rows[0];
  const a = await mk("ann", false), b = await mk("bob", false), mod = await mk("mod", true);
  const id = (u) => Number(u.id), draft = (to, extra = {}) => ({ to, subject: "Hi", body: "hello there", modNote: false, ...extra });

  assert.match((await M.sendMessage(a, draft("nobody" + n))).errors[0], /not a valid user/);
  assert.match((await M.sendMessage(a, draft("bob" + n, { body: "hey" }))).errors[0], /Body/);
  const r = await M.sendMessage(a, draft("BOB" + n));
  assert.ok(r.ok && r.to === "bob" + n);

  let inbox = await M.listMessages(id(b), "in");
  assert.equal(inbox.length, 1); assert.ok(inbox[0].unread);
  assert.equal((await M.listMessages(id(a), "out")).length, 1);
  const sid = inbox[0].short_id;
  assert.equal(await M.getMessage(id(mod), sid), null, "a third party can't read it");
  assert.equal((await M.getMessage(id(a), sid)).replyTo, "bob" + n);
  assert.ok((await M.listMessages(id(b), "in"))[0].unread, "the author reading it doesn't mark it read");
  assert.equal((await M.getMessage(id(b), sid)).replyTo, "ann" + n);
  assert.ok(!(await M.listMessages(id(b), "in"))[0].unread);
  await M.keepAsNew(id(a), sid); assert.ok(!(await M.listMessages(id(b), "in"))[0].unread, "only the recipient can");
  await M.keepAsNew(id(b), sid); assert.ok((await M.listMessages(id(b), "in"))[0].unread);

  assert.equal(await M.deleteMessages(id(mod), [sid]), 0);
  assert.equal(await M.deleteMessages(id(a), [sid]), 1);
  assert.equal((await M.listMessages(id(a), "out")).length, 0);
  assert.equal((await M.listMessages(id(b), "in")).length, 1, "the recipient still has it");
  assert.equal(await M.deleteMessages(id(b), [sid]), 1);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.messages WHERE short_id = $1", [sid])).rows[0].n, 0, "gone once both deleted");
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.notifications WHERE user_id = $1 AND notifiable_type = 'Message'", [id(b)])).rows[0].n, 0);

  assert.ok((await M.sendMessage(a, draft("mod" + n, { modNote: true }))).ok);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.mod_notes WHERE user_id = $1", [id(mod)])).rows[0].n, 0, "a non-moderator's modNote flag is ignored");
  assert.ok((await M.sendMessage(mod, draft("bob" + n, { modNote: true }))).ok);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.mod_notes WHERE user_id = $1", [id(b)])).rows[0].n, 1);
  const got = (await M.listMessages(id(mod), "in"))[0].short_id;
  assert.ok((await M.noteMessage(id(mod), got)).ok);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.mod_notes WHERE user_id = $1", [id(a)])).rows[0].n, 1, "noted under the other party");
  assert.ok(!(await M.noteMessage(id(a), got)).ok);
});
