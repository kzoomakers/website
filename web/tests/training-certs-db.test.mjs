// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

// A tool, a member who has passed its test (certification in 'passed'), and trainer accounts.
const setup = async (need = 1) => {
  const { conn } = await import("../lib/db.ts");
  const K = await import("../lib/training/certs.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  const user = async (tag) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id", [`${tag}${n}@x.test`, tag])).rows[0].id;
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Lathe ${n}`])).rows[0].id;
  if (need > 1) await K.saveToolTraining(tool, { signoffs_required: need, validity_months: 12 }, "t");
  const m = await user("member"), t1 = await user("trainer1"), t2 = await user("trainer2"), other = await user("other");
  const cert = (await c.query("INSERT INTO certifications (user_id, tool_id, state, signoffs_required) VALUES ($1,$2,'passed',$3) RETURNING id", [m, tool, need])).rows[0].id;
  await K.setTrainer(tool, t1, true, "t"); await K.setTrainer(tool, t2, true, "t");
  const as = (id, all = false) => ({ id, email: `u${id}@x.test`, all, view: all });
  return { c, K, n, tool, m, t1, t2, other, cert, as, state: async () => (await c.query("SELECT state FROM certifications WHERE id=$1", [cert])).rows[0].state, auth: async () => (await c.query("SELECT * FROM tool_auths WHERE user_id=$1 AND tool_id=$2", [m, tool])).rows };
};

test("walk through: start, ready, sign off grants the authorization and writes both audit rows", { skip }, async () => {
  const { c, K, cert, as, t1, m, tool, state, auth } = await setup();
  await K.startTraining(as(t1), cert); assert.equal(await state(), "in_training");
  await assert.rejects(K.startTraining(as(t1), cert), /already been dealt with/, "can't start twice");
  await K.addNote(as(t1), cert, "3 supervised cuts", true, true);
  await K.markReady(as(t1), cert); assert.equal(await state(), "ready");
  await assert.rejects(K.signOff(as(t1), cert, ""), /needs a note/);
  assert.deepEqual(await auth(), [], "nothing granted before sign-off");
  const r = await K.signOff(as(t1), cert, "Did the practical"); assert.equal(r.certified, true);
  const [a] = await auth(); assert.equal(a.source, "training"); assert.equal(a.cert_id, cert); assert.equal(a.retake_due_on, null);
  assert.equal(await state(), "certified");
  assert.ok((await c.query("SELECT 1 FROM audit WHERE action = 'training.cert.signoff'")).rowCount >= 1);
  assert.ok((await c.query("SELECT 1 FROM audit WHERE action = 'user.authorize' AND target LIKE $1", [`%Lathe%`])).rowCount >= 1);
  await assert.rejects(K.signOff(as(t1), cert, "again"), /Already certified/);
  assert.equal((await K.file(as(t1), cert)).events.length, 4);
  await assert.rejects(K.startTraining(as(m), cert), /not found/);
});

test("who may act: unassigned trainers, members, and the member themselves are refused; whole-section writers are not", { skip }, async () => {
  const { K, cert, as, other, m, t1, state } = await setup();
  await assert.rejects(K.signOff(as(other), cert, "sure"), /not found/, "unassigned trainer");
  await assert.rejects(K.file(as(other), cert), /not found/, "can't even open it");
  assert.deepEqual((await K.queue(as(other))).rows, [], "empty queue");
  await assert.rejects(K.signOff(as(m, true), cert, "my own"), /your own/, "self sign-off refused even with full rights");
  await assert.rejects(K.signOff({ id: null, email: "g@x", all: true, view: true }, cert, "ok then"), /member account/);
  assert.equal((await K.queue(as(t1))).rows.length, 1);
  assert.equal(await state(), "passed");
  assert.equal((await K.file(as(other, true), cert)).can, true, "whole-section writer");
});

test("two sign-offs needed: same trainer can't count twice, second trainer completes", { skip }, async () => {
  const { K, cert, as, t1, t2, state, auth } = await setup(2);
  const r1 = await K.signOff(as(t1), cert, "first"); assert.equal(r1.certified, false); assert.equal(await state(), "passed");
  await assert.rejects(K.signOff(as(t1), cert, "again"), /already signed/);
  assert.deepEqual(await auth(), []);
  const r2 = await K.signOff(as(t2), cert, "second"); assert.equal(r2.certified, true);
  const [a] = await auth(); assert.ok(a.expires_on, "12 months validity applied");
});

test("race: two trainers sign off at once, exactly one grant", { skip }, async () => {
  const { K, cert, as, t1, t2, c, m, tool } = await setup();
  const rs = await Promise.allSettled([K.signOff(as(t1), cert, "note a"), K.signOff(as(t2), cert, "note b")]);
  assert.equal(rs.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await c.query("SELECT 1 FROM tool_auths WHERE user_id=$1 AND tool_id=$2", [m, tool])).rowCount, 1);
  assert.equal((await c.query("SELECT 1 FROM cert_signoffs WHERE cert_id=$1", [cert])).rowCount, 1);
});

test("reject needs a reason; manual grants can be switched off per tool", { skip }, async () => {
  const { K, cert, as, t1, state, m, tool } = await setup();
  await assert.rejects(K.reject(as(t1), cert, ""), /Say why/);
  await K.reject(as(t1), cert, "Review lockout steps"); assert.equal(await state(), "rejected");
  await assert.rejects(K.signOff(as(t1), cert, "nope"), /closed/);
  const { grantAuth } = await import("../lib/tools.ts");
  await grantAuth(m, tool, null, "ok", "admin");
  await K.saveToolTraining(tool, { signoffs_required: 1, manual_grant_allowed: false }, "t");
  await assert.rejects(grantAuth(m, tool, null, "ok", "admin"), /signed off through training/);
});
