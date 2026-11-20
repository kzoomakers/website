// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("reparent: admins only, tree stays a tree, notes and log entry written once", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { reparentUser } = await import("../feed/models/mod-reparent.ts");
  const c = await conn(), n = Date.now().toString(36).slice(-8);
  const mk = async (name, admin, by) => (await c.query(`INSERT INTO feed.users (username, email, token, is_admin, is_moderator, invited_by_user_id) VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, admin, by ?? null])).rows[0];
  const root = await mk("root", false), kid = await mk("kid", false, root.id), adm = await mk("adm", true, kid.id), mod = await mk("mod", false), loner = await mk("loner", false), other = await mk("other", false, root.id);
  const inviter = (u) => c.query("SELECT invited_by_user_id b FROM feed.users WHERE id = $1", [u.id]).then((r) => Number(r.rows[0].b));

  assert.ok(!(await reparentUser(mod, "kid" + n, "x")).ok, "a non-admin can't");
  assert.match((await reparentUser(adm, "kid" + n, "  ")).error, /Reason/);
  assert.match((await reparentUser(adm, "nobody" + n, "x")).error, /Invalid/);
  assert.match((await reparentUser(adm, "adm" + n, "x")).error, /yourself/);
  assert.match((await reparentUser(adm, "loner" + n, "x")).error, /no inviter/);
  assert.match((await reparentUser(adm, "kid" + n, "x")).error, /directly or not/, "adm was invited by kid: moving kid under adm would loop");
  assert.equal(await inviter(kid), Number(root.id));

  const r = await reparentUser(adm, "OTHER" + n, "abused off-site");
  assert.ok(r.ok && r.username === "other" + n);
  assert.equal(await inviter(other), Number(adm.id), "now invited by the admin");
  const notes = (u) => c.query("SELECT note FROM feed.mod_notes WHERE user_id = $1", [u.id]).then((x) => x.rows.map((y) => y.note));
  assert.deepEqual(await notes(other), [`Reparented from [root${n}](/~root${n}) to adm${n} with reason: abused off-site`]);
  assert.deepEqual(await notes(root), [`Admin reparented their invitee [other${n}](/~other${n}) to adm${n} with reason: abused off-site`]);
  const log = (await c.query("SELECT action, reason FROM feed.moderations WHERE user_id = $1", [other.id])).rows;
  assert.deepEqual(log, [{ action: `Reparented user to be invited by adm${n}`, reason: "abused off-site" }]);
  assert.match((await reparentUser(adm, "other" + n, "again")).error, /already invited/);
});
