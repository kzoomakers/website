// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("classes and online tests switch independently; off classes show members nothing, and nothing is deleted", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const F = await import("../lib/features.ts"), crm = await import("../lib/crm.ts");
  const c = await conn(), n = Date.now();
  const user = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'F', now()) RETURNING id", [`f${n}@x.test`])).rows[0].id;
  const log = async () => {};
  await F.saveFeatures({ classes: true, tests: false }, "t", log);
  assert.deepEqual(await F.features(), { classes: true, tests: false });
  const k = (await c.query("INSERT INTO classes (title, starts_at) VALUES ($1, now() + interval '30 days') RETURNING id", [`Intro ${n}`])).rows[0].id;
  assert.equal((await crm.upcomingClasses(user)).some((x) => x.id === k), true);
  await F.saveFeatures({ classes: false, tests: true }, "t", log);
  assert.deepEqual(await F.features(), { classes: false, tests: true }, "the two are independent");
  assert.deepEqual(await crm.upcomingClasses(user), [], "no classes for members while off");
  assert.equal((await c.query("SELECT 1 FROM classes WHERE id = $1", [k])).rowCount, 1, "the class itself is kept");
  await F.saveFeatures({ classes: true }, "t", log);
  assert.equal((await crm.upcomingClasses(user)).some((x) => x.id === k), true, "back on, back as it was");
});

const world = async () => {
  const { conn } = await import("../lib/db.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  const mk = async (name) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id, email", [`${name}${n}@x.test`, name])).rows[0];
  return { c, n, member: await mk("Mem"), trainer: await mk("Tra"), tool: (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Press ${n}`])).rows[0].id };
};
const withTest = async (tool) => {
  const T = await import("../lib/training/tests.ts");
  const id = await T.createTest(tool, "", "t"), r = (await T.getTest(id)).revisions[0].id;
  await T.saveQuestion(r, (await T.getRevision(r)).rev.at, { type: "true_false", prompt_html: "<p>Safe?</p>", points: 1, config: { correct: true } });
  await T.publish(r, (await T.getRevision(r)).rev.at, {}, "t");
  return { id, qid: (await T.getRevision(r)).questions[0].id };
};

test("all four combinations: each workflow follows its own switch and hands-on training fills the gap", { skip }, async () => {
  const F = await import("../lib/features.ts"), crm = await import("../lib/crm.ts"), A = await import("../lib/training/attempts.ts"), K = await import("../lib/training/certs.ts");
  const { c, member, trainer, tool } = await world(), log = async () => {};
  const t = await withTest(tool);
  await c.query("INSERT INTO tool_trainers (tool_id, user_id, added_by) VALUES ($1,$2,'t')", [tool, trainer.id]);
  const k = (await c.query("INSERT INTO classes (title, starts_at) VALUES ('Combo', now() + interval '30 days') RETURNING id")).rows[0].id;
  const act = { id: trainer.id, email: trainer.email, all: false, view: false };
  for (const [classes, tests] of [[true, true], [true, false], [false, true], [false, false]]) {
    await F.saveFeatures({ classes, tests }, "t", log);
    assert.deepEqual(await F.features(), { classes, tests });
    assert.equal((await crm.upcomingClasses(member.id)).some((x) => x.id === k), classes, `classes ${classes}`);
    if (tests) assert.equal((await A.start(member.id, t.id)).attempt_no, 1, "a test can be started");
    else await assert.rejects(A.start(member.id, t.id), /isn't open yet/);
    await c.query("UPDATE attempts SET status = 'void' WHERE user_id = $1 AND status = 'in_progress'", [member.id]);
    // Hands-on training is for tools with no test, or any tool while tests are off.
    const open = (await K.handsOnTools(act)).some((x) => x.id === tool);
    assert.equal(open, !tests, `hands-on offered ${!tests}`);
    if (tests) await assert.rejects(K.beginHandsOn(act, member.id, tool), /online test/);
  }
  // Neither switch on: the trainer takes someone from nothing to an authorization.
  const r = await K.beginHandsOn(act, member.id, tool);
  assert.equal((await c.query("SELECT state, source FROM certifications WHERE id = $1", [r.id])).rows[0].state, "in_training");
  await assert.rejects(K.beginHandsOn(act, member.id, tool), /already have training/);
  await assert.rejects(K.beginHandsOn({ ...act, id: member.id, email: member.email }, member.id, tool), /your own/);
  await assert.rejects(K.beginHandsOn({ id: member.id, email: member.email, all: false, view: false }, trainer.id, tool), /not found/, "only this tool's trainers");
  assert.equal((await K.signOff(act, r.id, "Showed the guard and the stop")).certified, true);
  assert.equal((await c.query("SELECT source FROM tool_auths WHERE user_id = $1 AND tool_id = $2", [member.id, tool])).rows[0].source, "training");
  await assert.rejects(K.beginHandsOn(act, member.id, tool), /already authorized/);
});

test("switching tests off mid-test lets the person finish the attempt they have open", { skip }, async () => {
  const F = await import("../lib/features.ts"), A = await import("../lib/training/attempts.ts");
  const { member, tool } = await world(), log = async () => {};
  const t = await withTest(tool);
  await F.saveFeatures({ tests: true }, "t", log);
  const v = await A.start(member.id, t.id);
  await F.saveFeatures({ tests: false }, "t", log);
  assert.deepEqual(await A.save(member.id, v.attemptId, { [t.qid]: true }, 1), { ok: true });
  assert.equal((await A.submit(member.id, v.attemptId, null)).passed, true, "graded as normal");
  await F.saveFeatures({ tests: true }, "t", log);
});
