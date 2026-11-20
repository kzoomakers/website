// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("hats: request, approve and reject, wear on a message, edit, doff", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const H = await import("../feed/models/hats.ts");
  const M = await import("../feed/models/messages.ts");
  const c = await conn(), n = Date.now().toString(36).slice(-8);
  const mk = async (name, mod) => (await c.query(`INSERT INTO feed.users (username, email, token, is_moderator) VALUES ($1, $2, $3, $4) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, mod])).rows[0];
  const ann = await mk("ann", false), bob = await mk("bob", false), mod = await mk("mod", true);
  const id = (u) => Number(u.id);
  const mine = async (u) => (await c.query("SELECT id FROM feed.hat_requests WHERE user_id = $1", [id(u)])).rows.map((r) => Number(r.id));

  assert.ok(!(await H.requestHat(id(ann), { hat: "", link: "x", comment: "y" })).ok);
  assert.ok((await H.requestHat(id(ann), { hat: "Proj Dev", link: "ann@proj.org", comment: "I am" })).ok);
  assert.ok((await H.requestHat(id(bob), { hat: "Nope", link: "x", comment: "y" })).ok);
  const [areq] = await mine(ann), [breq] = await mine(bob);

  assert.ok(!(await H.decideRequest(id(ann), areq, true, { hat: "Proj Dev", link: "l", reason: "ok" })).ok, "only moderators decide");
  assert.ok(!(await H.decideRequest(id(mod), areq, true, { hat: "Proj Dev", link: "l", reason: " " })).ok, "a reason is needed");
  assert.ok((await H.decideRequest(id(mod), areq, true, { hat: "Project Dev", link: "ann@proj.org", reason: "verified" })).ok);
  assert.ok((await H.decideRequest(id(mod), breq, false, { hat: "", link: "", reason: "not notable" })).ok);
  assert.ok(!(await H.decideRequest(id(mod), areq, true, { hat: "x", link: "", reason: "again" })).ok, "handled once");
  assert.deepEqual(await mine(ann), []);
  assert.match((await M.listMessages(id(ann), "in"))[0].subject, /approved/);
  assert.match((await M.listMessages(id(bob), "in"))[0].subject, /rejected/);

  const hats = await H.wearableHats(id(ann));
  assert.equal(hats.length, 1); assert.equal(hats[0].hat, "Project Dev");
  assert.equal((await H.wearableHats(id(bob))).length, 0);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.moderations WHERE user_id = $1 AND action LIKE 'Granted hat%'", [id(ann)])).rows[0].n, 1);

  assert.ok((await M.sendMessage(ann, { to: "bob" + n, subject: "s", body: "wearing it", modNote: false, hat: hats[0].short_id })).ok);
  assert.ok((await M.sendMessage(bob, { to: "ann" + n, subject: "s", body: "stealing it", modNote: false, hat: hats[0].short_id })).ok);
  assert.equal((await M.listMessages(id(bob), "in")).find((m) => m.author === "ann" + n).hat, "Project Dev");
  assert.equal((await M.listMessages(id(ann), "in")).find((m) => m.author === "bob" + n).hat, null, "a hat you don't wear is ignored");

  const sid = hats[0].short_id;
  assert.ok(!(await H.editHat(id(ann), sid, { hat: "Boss", link: "" }, false)).ok, "editing is for moderators");
  assert.ok((await H.editHat(id(mod), sid, { hat: "Lead Dev", link: "ann@proj.org" }, false)).ok);
  assert.equal((await H.wearableHats(id(ann)))[0].hat, "Lead Dev");
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.moderations WHERE user_id = $1 AND action LIKE 'renamed hat%'", [id(ann)])).rows[0].n, 1);
  assert.ok((await H.editHat(id(mod), sid, { hat: "Chief Dev", link: "ann@proj.org" }, true)).ok);
  const now = await H.wearableHats(id(ann));
  assert.deepEqual(now.map((h) => h.hat), ["Chief Dev"], "recreating doffs the old hat");

  assert.ok(!(await H.doffHat(id(bob), now[0].short_id, "mine now")).ok, "not your hat");
  assert.ok(!(await H.doffHat(id(ann), now[0].short_id, "  ")).ok, "a reason is needed");
  const d = await H.doffHat(id(ann), now[0].short_id, "left project");
  assert.ok(d.ok && d.username === "ann" + n);
  assert.equal((await H.wearableHats(id(ann))).length, 0);
  assert.deepEqual((await c.query("SELECT reason FROM feed.moderations WHERE user_id = $1 AND action = 'Doffed hat \"Chief Dev\"'", [id(ann)])).rows, [{ reason: "left project" }]);
});
