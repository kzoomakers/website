// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("which attempt a member is on is shown, and an admin reset lets them retake without deleting anything", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts"), O = await import("../lib/training/overrides.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Lathe ${n}`])).rows[0].id;
  const user = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'R', now()) RETURNING id", [`r${n}@x.test`])).rows[0].id;
  const lead = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'L', now()) RETURNING id", [`l${n}@x.test`])).rows[0].id;
  const id = await T.createTest(tool, "", "t"), r = (await T.getTest(id)).revisions[0].id;
  const q = await T.saveQuestion(r, (await T.getRevision(r)).rev.at, { type: "mc_single", prompt_html: "Guard on?", points: 1, config: { choices: ["Yes", "No"], correct: 0 } });
  await T.saveSettings(r, q.at, { max_attempts: 2, cooldown_hours: 1 });
  await T.publish(r, (await T.getRevision(r)).rev.at, {}, "t");
  const qid = (await T.getRevision(r)).questions[0].id;

  const v1 = await A.start(user, id);
  assert.deepEqual([v1.attempt_no, v1.max_attempts], [1, 2], "the first try");
  assert.equal((await A.submit(user, v1.attemptId, { [qid]: 1 })).passed, false);
  await c.query("UPDATE attempts SET submitted_at = now() - interval '2 hours' WHERE id = $1", [v1.attemptId]); // past the cooldown
  const v2 = await A.start(user, id);
  assert.equal(v2.attempt_no, 2, "the first retake");
  const res = await A.submit(user, v2.attemptId, { [qid]: 1 });
  assert.deepEqual([res.attempts_used, res.max_attempts], [2, 2]);
  await assert.rejects(A.start(user, id), /used all your attempts/);
  const card = () => A.overview(user).then((o) => o.cards.find((x) => x.test_id === id));
  assert.deepEqual([(await card()).state, (await card()).used, (await card()).max_attempts], ["locked", 2, 2]);

  const act = { id: lead, email: `l${n}@x.test`, all: true };
  await assert.rejects(O.override(act, { how: "reset_attempts", user, tool, reason: "short" }), /reason/);
  await O.override(act, { how: "reset_attempts", user, tool, reason: "Missed two on a bad day, trainer agreed" });
  const c2 = await card();
  assert.deepEqual([c2.state, c2.used], ["not_started", 0], "the cooldown and the limit are cleared");
  assert.equal((await c.query("SELECT 1 FROM attempts WHERE user_id = $1 AND status = 'submitted'", [user])).rowCount, 2, "earlier attempts stay on record");
  const v3 = await A.start(user, id);
  assert.equal(v3.attempt_no, 1, "counting starts again");
  assert.equal((await c.query("SELECT 1 FROM audit WHERE action = 'training.attempts.reset' AND actor = $1", [`l${n}@x.test`])).rowCount, 1, "logged");
  await assert.rejects(O.override({ ...act, id: user }, { how: "reset_attempts", user, tool, reason: "Resetting my own count" }), /your own/);
});
