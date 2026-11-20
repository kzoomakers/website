// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const setup = async () => {
  const { conn } = await import("../lib/db.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  const uid = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'Train Test', now()) RETURNING id", [`t${n}@example.org`])).rows[0].id;
  const tid = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Saw ${n}`])).rows[0].id;
  return { c, uid, tid };
};

test("migration is idempotent; hand-granted rows are legacy; the view takes the earlier of expiry and re-pass deadline", { skip }, async () => {
  const { ensureSchema } = await import("../lib/db.ts");
  const { c, uid, tid } = await setup();
  await c.query("INSERT INTO tool_auths (user_id, tool_id) VALUES ($1,$2)", [uid, tid]);
  const { Pool } = await import("pg"); const p = new Pool({ connectionString: url });
  await ensureSchema(p); await ensureSchema(p); await p.end();
  const row = async () => (await c.query("SELECT source, expired FROM tool_auths_effective WHERE user_id = $1 AND tool_id = $2", [uid, tid])).rows[0];
  assert.deepEqual(await row(), { source: "legacy", expired: false });
  await c.query("UPDATE tool_auths SET expires_on = current_date + 30, retake_due_on = current_date - 2 WHERE user_id = $1", [uid]);
  assert.equal((await row()).expired, true, "a missed re-pass deadline expires it even though expires_on is in the future");
  await c.query("UPDATE tool_auths SET expires_on = current_date - 2, retake_due_on = current_date + 20 WHERE user_id = $1", [uid]);
  assert.equal((await row()).expired, true, "expires_on alone still expires it");
  await c.query("UPDATE tool_auths SET expires_on = NULL, retake_due_on = NULL WHERE user_id = $1", [uid]);
  assert.equal((await row()).expired, false, "no dates: never expires");
});

test("a manual grant replaces a training record; one open certification per member and tool; events are append-only; tools with training history can't be deleted", { skip }, async () => {
  const T = await import("../lib/tools.ts");
  const { c, uid, tid } = await setup();
  const cert = (await c.query("INSERT INTO certifications (user_id, tool_id) VALUES ($1,$2) RETURNING id", [uid, tid])).rows[0].id;
  await assert.rejects(c.query("INSERT INTO certifications (user_id, tool_id) VALUES ($1,$2)", [uid, tid]), /certifications_one_open/);
  await c.query("INSERT INTO tool_auths (user_id, tool_id, source, cert_id, retake_due_on) VALUES ($1,$2,'training',$3, current_date + 5)", [uid, tid, cert]);
  await T.grantAuth(uid, tid, null, "by hand", "tester");
  assert.deepEqual((await c.query("SELECT source, cert_id, retake_due_on FROM tool_auths WHERE user_id = $1 AND tool_id = $2", [uid, tid])).rows[0], { source: "manual", cert_id: null, retake_due_on: null });
  const [a] = await T.authsFor(uid); assert.equal(a.source, "manual"); assert.equal(a.expired, false);
  await c.query("INSERT INTO cert_events (cert_id, actor, kind, note) VALUES ($1,'t','note','did a cut')", [cert]);
  await assert.rejects(c.query("UPDATE cert_events SET note = 'edited' WHERE cert_id = $1", [cert]), /append-only/);
  await assert.rejects(T.deleteTool(tid), /can't be deleted/);
  await c.query("DELETE FROM site_users WHERE id = $1", [uid]); // erasing a member still works
  assert.equal((await c.query("SELECT 1 FROM cert_events WHERE cert_id = $1", [cert])).rowCount, 0);
});
