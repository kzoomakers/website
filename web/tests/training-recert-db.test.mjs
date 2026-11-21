// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

// A tool with a published test (rev 1) and holders: `n` trained members plus one legacy one.
const setup = async (trained = 1) => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts"), R = await import("../lib/training/recert.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Mill ${n}`])).rows[0].id;
  const user = async (tag) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id", [`${tag}${n}${Math.random()}@x.test`, tag])).rows[0].id;
  const testId = await T.createTest(tool, "", "t"), r1 = (await T.getTest(testId)).revisions[0].id;
  await T.saveQuestion(r1, (await T.getRevision(r1)).rev.at, { type: "mc_single", prompt_html: "Guard on?", points: 1, config: { choices: ["Yes", "No"], correct: 0 } });
  await T.publish(r1, (await T.getRevision(r1)).rev.at, {}, "t");
  const holders = [];
  for (let i = 0; i < trained; i++) {
    const u = await user("trained"), cert = (await c.query("INSERT INTO certifications (user_id, tool_id, revision_id, state, certified_at) VALUES ($1,$2,$3,'certified', now()) RETURNING id", [u, tool, r1])).rows[0].id;
    await c.query("INSERT INTO tool_auths (user_id, tool_id, granted_by, source, cert_id, revision_id) VALUES ($1,$2,'t','training',$3,$4)", [u, tool, cert, r1]); holders.push(u);
  }
  const legacy = await user("legacy"); await c.query("INSERT INTO tool_auths (user_id, tool_id, granted_by) VALUES ($1,$2,'t')", [legacy, tool]);
  const major = async (sources, days = 10) => {
    const d = await T.newDraft(testId, "t"), at = (await T.getRevision(d)).rev.at, dl = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
    return { id: d, ...(await T.publish(d, at, { kind: "major", note: "New lockout step", deadline: dl, sources }, "t")), dl };
  };
  const auth = async (u) => (await c.query("SELECT to_char(retake_due_on,'YYYY-MM-DD') AS due, revision_id, cert_id FROM tool_auths WHERE user_id=$1 AND tool_id=$2", [u, tool])).rows[0];
  const pass = async (u) => { const v = await A.start(u, testId); const q = v.questions[0]; await A.submit(u, v.attemptId, { [q.id]: q.view.choices.find((x) => x.text === "Yes").i }); };
  const overdue = (id) => c.query("UPDATE rollouts SET deadline = deadline - 30 WHERE id = $1", [id]);
  return { c, T, A, R, tool, testId, holders, legacy, major, auth, pass, overdue, user };
};

test("a major publish with a deadline sets it on trained holders only by default; legacy is left alone", { skip }, async () => {
  const { R, holders, legacy, major, auth, testId } = await setup();
  assert.deepEqual(await R.preview(testId), { training: 1, legacy: 1, manual: 0, override: 0 });
  const p = await major(undefined);
  assert.equal(p.rollout.members, 1);
  assert.equal((await auth(holders[0])).due, p.dl); assert.equal((await auth(legacy)).due, null);
});

test("a minor publish, or a major without a deadline, puts nobody on the clock", { skip }, async () => {
  const { T, holders, testId, auth } = await setup();
  const d = await T.newDraft(testId, "t");
  await T.publish(d, (await T.getRevision(d)).rev.at, { kind: "major", note: "Changed answers" }, "t");
  assert.equal((await auth(holders[0])).due, null);
});

test("passing the new revision satisfies it: deadline cleared, no new sign-off needed", { skip }, async () => {
  const { c, holders, major, auth, pass, tool } = await setup();
  await major(undefined);
  await pass(holders[0]);
  assert.equal((await auth(holders[0])).due, null);
  assert.equal((await c.query("SELECT 1 FROM certifications WHERE user_id=$1 AND tool_id=$2 AND state='passed'", [holders[0], tool])).rowCount, 0, "no sign-off queue entry");
  assert.equal((await c.query("SELECT status FROM rollout_members WHERE user_id=$1", [holders[0]])).rows[0].status, "satisfied");
  assert.equal((await c.query("SELECT 1 FROM cert_events WHERE kind='repass'")).rowCount >= 1, true);
});

test("the sweep lapses stragglers after the deadline, keeps the row, and a later pass restores it", { skip }, async () => {
  const { c, R, holders, major, auth, pass, overdue, tool, testId } = await setup(5); // 4 of 5 still owing trips the guard (it only applies from 4 people up)
  const p = await major(undefined);
  await overdue(p.rollout.id); await c.query("UPDATE tool_auths SET retake_due_on = retake_due_on - 30 WHERE tool_id = $1", [tool]);
  await pass(holders[0]);
  await R.lapseSweep();
  assert.equal((await c.query("SELECT status FROM rollout_members WHERE user_id=$1", [holders[1]])).rows[0].status, "pending", "4 of 5 pending trips the guard and waits");
  assert.ok((await c.query("SELECT 1 FROM rollouts WHERE id=$1 AND guard_at IS NOT NULL", [p.rollout.id])).rowCount);
  await R.confirmLapse(p.rollout.id, "lead");
  assert.equal(await R.lapseSweep(), 4);
  assert.equal((await c.query("SELECT state FROM certifications WHERE user_id=$1 AND tool_id=$2", [holders[1], tool])).rows[0].state, "lapsed");
  assert.ok(await auth(holders[1]), "the authorization row is kept");
  assert.equal((await c.query("SELECT expired FROM tool_auths_effective WHERE user_id=$1 AND tool_id=$2", [holders[1], tool])).rows[0].expired, true);
  assert.equal((await A_overview(holders[1])).state, "lapsed");
  await pass(holders[1]);
  assert.equal((await c.query("SELECT state FROM certifications WHERE user_id=$1 AND tool_id=$2", [holders[1], tool])).rows[0].state, "certified");
  assert.equal((await c.query("SELECT expired FROM tool_auths_effective WHERE user_id=$1 AND tool_id=$2", [holders[1], tool])).rows[0].expired, false);
  async function A_overview(u) { const A = await import("../lib/training/attempts.ts"); return (await A.overview(u)).cards.find((x) => x.test_id === testId) ?? {}; }
});

test("extend restores lapsed people; undo clears the clock; exempt needs a reason", { skip }, async () => {
  const { c, R, holders, major, auth, overdue, tool } = await setup(1);
  const p = await major(undefined);
  await overdue(p.rollout.id); await c.query("UPDATE tool_auths SET retake_due_on = retake_due_on - 30 WHERE tool_id = $1", [tool]);
  await R.lapseSweep(); // 1 of 1 is below the guard's minimum size, so it lapses
  assert.equal((await c.query("SELECT status FROM rollout_members WHERE user_id=$1", [holders[0]])).rows[0].status, "lapsed");
  const later = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
  await R.extendRollout(p.rollout.id, later, "lead");
  assert.equal((await auth(holders[0])).due, later);
  assert.equal((await c.query("SELECT state FROM certifications WHERE user_id=$1", [holders[0]])).rows[0].state, "certified");
  await assert.rejects(R.memberOverride(p.rollout.id, holders[0], tool, "exempt", null, "", "lead"), /reason/);
  await R.undoRollout(p.rollout.id, "lead");
  assert.equal((await auth(holders[0])).due, null);
  await assert.rejects(R.extendRollout(p.rollout.id, later, "lead"), /isn't active/);
});

test("a second major revision supersedes the first rollout for the same people", { skip }, async () => {
  const { c, holders, major, auth } = await setup();
  const p1 = await major(undefined, 10), p2 = await major(undefined, 20);
  assert.equal((await auth(holders[0])).due, p2.dl);
  assert.equal((await c.query("SELECT status FROM rollout_members WHERE rollout_id=$1", [p1.rollout.id])).rows[0].status, "exempt");
});

test("with Training switched off the deadline sweep pauses: nobody lapses until it's back on", { skip }, async () => {
  const { c, R, holders, major, overdue, tool } = await setup(1);
  const S = await import("../lib/training/settings.ts");
  const p = await major(undefined);
  await overdue(p.rollout.id); await c.query("UPDATE tool_auths SET retake_due_on = retake_due_on - 30 WHERE tool_id = $1", [tool]);
  const st = async () => (await c.query("SELECT status FROM rollout_members WHERE user_id=$1", [holders[0]])).rows[0].status;
  await S.saveTrainingCfg({ enabled: false });
  try { assert.equal(await R.lapseSweep(), 0); assert.equal(await st(), "pending"); } finally { await S.saveTrainingCfg({ enabled: true }); }
  await R.lapseSweep(); assert.equal(await st(), "lapsed");
});
