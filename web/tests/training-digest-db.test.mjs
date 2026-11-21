// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";
const MONDAY = new Date("2026-11-23T15:00:00Z"), TUESDAY = new Date("2026-11-24T15:00:00Z");

test("Monday digest: once per trainer, only Mondays, only when someone waits, not when opted out; granters are suggested", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const N = await import("../lib/training/notify.ts"), K = await import("../lib/training/certs.ts"), S = await import("../lib/training/settings.ts");
  await S.saveTrainingCfg({ enabled: true });
  const c = await conn(), n = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const user = async (tag, email = `${tag}${n}@x.test`) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id", [email, `${tag}${n}`])).rows[0].id;
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Saw ${n}`])).rows[0].id;
  const [a, b, member, granter] = [await user("a"), await user("b"), await user("m"), await user("g")];
  for (const t of [a, b]) await c.query("INSERT INTO tool_trainers (tool_id, user_id) VALUES ($1,$2)", [tool, t]);
  await c.query("UPDATE site_users SET trainer_digest = false WHERE id = $1", [b]);
  await c.query("INSERT INTO certifications (user_id, tool_id, state) VALUES ($1,$2,'passed')", [member, tool]);
  const mails = async () => (await c.query("SELECT count(*)::int AS n FROM mail_queue WHERE msg::text LIKE $1", [`%a${n}@x.test%`])).rows[0].n;
  const sent = async (id) => (await c.query("SELECT 1 FROM training_mail_log WHERE key LIKE $1", [`digest:${id}:%`])).rowCount;
  await N.trainerDigest(TUESDAY);
  assert.equal(await sent(a), 0, "not on a Tuesday");
  await N.trainerDigest(MONDAY);
  assert.equal(await sent(a), 1);
  assert.equal(await sent(b), 0, "opted out");
  await N.trainerDigest(MONDAY);
  assert.equal(await sent(a), 1, "once per Monday");
  assert.equal(await mails(), 1, "one mail queued for the trainer, none for the opted-out one");
  await c.query("INSERT INTO tool_auths (user_id, tool_id, granted_by) VALUES ($1,$2,$3)", [member, tool, `g${n}@x.test`]);
  await user("decoy", `other${n}@x.test`); await c.query("UPDATE site_users SET name = $2 WHERE email = $1", [`other${n}@x.test`, `g${n}`]); // same name as the granter, different person
  const row = (await K.trainerMatrix()).find((t) => t.id === tool);
  assert.deepEqual(row.suggested.map((x) => x.id), [granter]);
});
