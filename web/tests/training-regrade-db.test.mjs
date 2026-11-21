// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

// Revision 1 has the wrong key (says "true" is correct). Four people take it: two answer false, two answer true.
// Correcting the key to "false" should pass the two who answered false, and put the two who answered true up for a lead's decision.
const setup = async () => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Jointer ${n}`])).rows[0].id;
  const mk = async (tag) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id", [`${tag}${n}@x.test`, tag])).rows[0].id;
  const lead = await mk("lead");
  const id = await T.createTest(tool, "", "t");
  const r1 = (await T.getTest(id)).revisions[0].id;
  await T.saveQuestion(r1, (await T.getRevision(r1)).rev.at, { type: "true_false", prompt_html: "<p>Guard on?</p>", points: 1, config: { correct: true } });
  await T.publish(r1, (await T.getRevision(r1)).rev.at, {}, "t");
  const qid = (await T.getRevision(r1)).questions[0].id;
  const take = async (who, answer) => { const u = await mk(who); const v = await A.start(u, id); await A.submit(u, v.attemptId, { [qid]: answer }); return { u, attempt: v.attemptId }; };
  const a = await take("aa", false), b = await take("bb", true), e = await take("ee", true);
  const d = await mk("dd"), dOpen = await A.start(d, id); // still mid-test when the correction is attempted
  // Revision 2: the same question, corrected key, published as a minor change.
  const draft = await T.newDraft(id, "t"), dq = (await T.getRevision(draft)).questions[0];
  await T.saveQuestion(draft, (await T.getRevision(draft)).rev.at, { id: dq.id, type: "true_false", prompt_html: dq.prompt_html, points: 1, config: { correct: false } });
  await T.publish(draft, (await T.getRevision(draft)).rev.at, { kind: "minor", note: "Key fixed" }, "t");
  const r2 = (await T.getTest(id)).revisions.find((x) => x.status === "published" && x.rev_no > 1).id;
  return { c, T, id, r1, r2, tool, lead, qid, a, b, e, d, dAttempt: dOpen.attemptId, dqid: dq.id };
};

test("the corrected version must be newer, and the preview counts both directions without changing anything", { skip }, async () => {
  const { c, r1, r2 } = await setup();
  const R = await import("../lib/training/regrade.ts");
  await assert.rejects(R.preview(r2, r1), /newer/);
  const p = await R.preview(r1, r2);
  assert.deepEqual([p.promote, p.demote, p.same, p.in_progress], [1, 2, 0, 1], "one person is still mid-test");
  assert.equal((await c.query("SELECT count(*)::int n FROM regrades WHERE from_rev = $1", [r1])).rows[0].n, 0, "a preview writes nothing");
});

test("applying waits for people still mid-test, then promotes fail-to-pass and queues pass-to-fail for a lead", { skip }, async () => {
  const { c, r1, r2, tool, lead, a, b, e, d, dAttempt, qid } = await setup();
  const R = await import("../lib/training/regrade.ts");
  const actor = { id: lead, email: "lead@x.test", all: true, view: true };
  await assert.rejects(R.apply(actor, r1, r2), /still taking/);
  const A = await import("../lib/training/attempts.ts");
  await A.submit(d, dAttempt, { [qid]: false });
  const res = await R.apply(actor, r1, r2);
  assert.deepEqual([res.promoted, res.pending], [2, 2]);
  await assert.rejects(R.apply(actor, r1, r2), /already been applied/);
  const certOf = async (u) => (await c.query("SELECT state FROM certifications WHERE user_id = $1 AND tool_id = $2", [u.u ?? u, tool])).rows[0]?.state;
  assert.equal(await certOf(a), "passed", "the person who answered false now passes and is in the queue");
  assert.equal(await certOf(b), "passed", "the pass-to-fail keeps its certification until a lead decides");
  assert.equal((await c.query("SELECT passed FROM attempts WHERE id = $1", [b.attempt])).rows[0].passed, true);
  const pending = (await c.query("SELECT i.id, a.id AS attempt FROM regrade_items i JOIN regrades g ON g.id = i.regrade_id JOIN attempts a ON a.id = i.attempt_id WHERE i.state = 'pending' AND g.from_rev = $1 ORDER BY i.id", [r1])).rows;
  assert.deepEqual(pending.map((x) => x.attempt).sort(), [b.attempt, e.attempt].sort());
});

test("a lead revokes what the attempt earned, or keeps it; each decision is final and needs a reason", { skip }, async () => {
  const { c, r1, r2, tool, lead, qid, b, e, d, dAttempt } = await setup();
  const R = await import("../lib/training/regrade.ts"), A = await import("../lib/training/attempts.ts");
  const actor = { id: lead, email: "lead@x.test", all: true, view: true };
  await A.submit(d, dAttempt, { [qid]: false });
  await R.apply(actor, r1, r2);
  const itemOf = async (attempt) => (await c.query("SELECT id FROM regrade_items WHERE attempt_id = $1", [attempt])).rows[0].id;
  const certOf = async (u) => (await c.query("SELECT state FROM certifications WHERE user_id = $1 AND tool_id = $2", [u.u, tool])).rows[0]?.state;
  await assert.rejects(R.decide(actor, await itemOf(b.attempt), "revoke", "too short"), /at least a sentence/);
  await assert.rejects(R.decide(actor, await itemOf(b.attempt), "maybe", "a long enough reason here"), /keep or revoke/);
  await R.decide(actor, await itemOf(b.attempt), "revoke", "The key was wrong for everyone who answered true.");
  assert.equal(await certOf(b), "revoked", "the certification from that attempt is taken back");
  assert.equal((await c.query("SELECT passed FROM attempts WHERE id = $1", [b.attempt])).rows[0].passed, false, "the attempt now reads as not passed");
  assert.equal((await c.query("SELECT state FROM regrade_items WHERE attempt_id = $1", [b.attempt])).rows[0].state, "revoked");
  assert.equal((await c.query("SELECT count(*)::int n FROM cert_events ce JOIN certifications c2 ON c2.id = ce.cert_id WHERE c2.user_id = $1 AND ce.note LIKE 'The key was wrong%'", [b.u])).rows[0].n, 1, "the reason is in the member's file");
  await R.decide(actor, await itemOf(e.attempt), "keep", "The trainer saw the work and the pass stands.");
  assert.equal(await certOf(e), "passed", "kept: the certification is untouched");
  assert.equal((await c.query("SELECT passed FROM attempts WHERE id = $1", [e.attempt])).rows[0].passed, true);
  assert.equal((await c.query("SELECT state FROM regrade_items WHERE attempt_id = $1", [e.attempt])).rows[0].state, "kept");
  await assert.rejects(R.decide(actor, await itemOf(b.attempt), "keep", "already decided by the lead"), /already been decided/);
  const l = await R.list((await c.query("SELECT test_id FROM test_revisions WHERE id = $1", [r1])).rows[0].test_id);
  assert.equal(l.pending.length, 0);
  assert.equal(l.runs[0].revoked + l.runs[0].kept, 2);
});
