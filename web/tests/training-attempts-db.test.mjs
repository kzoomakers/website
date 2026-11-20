// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const setup = async (rev = {}) => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Saw ${n}`])).rows[0].id;
  const user = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'M', now()) RETURNING id", [`m${n}@x.test`])).rows[0].id;
  const id = await T.createTest(tool, "", "t"), r = (await T.getTest(id)).revisions[0].id;
  const q = await T.saveQuestion(r, (await T.getRevision(r)).rev.at, { type: "mc_single", prompt_html: "Guard on?", points: 1, required_correct: true, config: { choices: ["Yes", "No"], correct: 0 } });
  if (Object.keys(rev).length) await T.saveSettings(r, q.at, rev);
  await T.publish(r, (await T.getRevision(r)).rev.at, {}, "t");
  const qid = (await T.getRevision(r)).questions[0].id, yes = (v) => v.questions[0].view.choices.find((x) => x.text === "Yes").i;
  return { c, A, id, tool, user, qid, yes, r };
};

test("start, save, submit grades on the server, one certification, no authorization", { skip }, async () => {
  const { c, A, id, tool, user, qid, yes } = await setup();
  const v = await A.start(user, id);
  assert.equal(JSON.stringify(v).includes('"correct"'), false, "no answer key in what the member gets");
  assert.equal((await A.start(user, id)).attemptId, v.attemptId, "a second start resumes");
  assert.deepEqual(await A.save(user, v.attemptId, { [qid]: yes(v) }, 2), { ok: true });
  assert.equal((await A.save(user, v.attemptId, { [qid]: 99 }, 1)).stale, true, "an older save is ignored");
  await assert.rejects(A.result(user, v.attemptId), /isn't finished/);
  const [r1, r2] = await Promise.all([A.submit(user, v.attemptId, null), A.submit(user, v.attemptId, null)]);
  assert.equal(r1.passed, true); assert.equal(r2.pct, 100);
  assert.equal((await c.query("SELECT 1 FROM certifications WHERE user_id=$1 AND tool_id=$2 AND state='passed'", [user, tool])).rowCount, 1, "double submit, one certification");
  assert.equal((await c.query("SELECT 1 FROM tool_auths WHERE user_id=$1", [user])).rowCount, 0);
  await assert.rejects(A.start(user, id), /already passed/);
  const other = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'O', now()) RETURNING id", [`o${Date.now()}@x.test`])).rows[0].id;
  await assert.rejects(A.result(other, v.attemptId), /not found/, "someone else's attempt is a 404");
  assert.equal((await A.overview(user)).cards.find((x) => x.test_id === id).state, "awaiting_trainer");
});

test("a failed attempt uses the missed-only review, honours attempts and cooldown", { skip }, async () => {
  const { A, id, user, qid } = await setup({ max_attempts: 2, cooldown_hours: 1 });
  const v = await A.start(user, id), r = await A.submit(user, v.attemptId, { [qid]: 1 });
  assert.equal(r.passed, false); assert.equal(r.questions.length, 1); assert.equal("answer" in r.questions[0], false, "no key on a failed attempt");
  await assert.rejects(A.start(user, id), /wait/);
});

test("answers after the deadline are ignored and the attempt expires", { skip }, async () => {
  const { c, A, id, user, qid, yes } = await setup({ time_limit_min: 5 });
  const v = await A.start(user, id);
  await A.save(user, v.attemptId, { [qid]: 1 }, 1);
  await c.query("UPDATE attempts SET due_at = now() - interval '5 minutes' WHERE id = $1", [v.attemptId]);
  await assert.rejects(A.save(user, v.attemptId, { [qid]: yes(v) }, 2), /Time is up/);
  const r = await A.submit(user, v.attemptId, { [qid]: yes(v) });
  assert.deepEqual([r.status, r.passed], ["expired", false], "graded from the autosave, not the late answers");
});

test("flag off blocks starting", { skip }, async () => {
  const { A, id, user } = await setup();
  const S = await import("../lib/training/settings.ts"); await S.saveTrainingCfg({ enabled: false });
  await assert.rejects(A.start(user, id), /isn't open/);
  await S.saveTrainingCfg({ enabled: true });
});
