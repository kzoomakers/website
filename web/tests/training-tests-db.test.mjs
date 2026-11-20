// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const mc = (prompt, correct = 0) => ({ type: "mc_single", prompt_html: prompt, points: 1, config: { choices: ["Yes", "No"], correct } });
const setup = async () => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Router ${n}`])).rows[0].id;
  const id = await T.createTest(tool, "", "tester"), t = await T.getTest(id), rev = t.revisions[0].id;
  return { c, T, tool, id, rev, at: async () => (await T.getRevision(rev)).rev.at };
};

test("create, edit a draft, concurrent edits are refused, publish checks and freezes", { skip }, async () => {
  const { T, tool, id, rev, at, c } = await setup();
  assert.match((await T.getTest(id)).test.title, /Router .* safety test/);
  await assert.rejects(T.createTest(tool, "again", "t"), /already has a test/);
  assert.ok((await T.toolsWithoutTest()).every((x) => x.id !== tool));
  const a0 = await at();
  const q = await T.saveQuestion(rev, a0, mc("<p>Is the guard on?</p><script>x</script>"));
  await assert.rejects(T.saveQuestion(rev, a0, mc("stale")), /Someone else changed/, "a stale version is refused");
  const s = await T.saveSettings(rev, q.at, { pass_pct: 90, time_limit_min: 10, review_mode: "all" });
  await assert.rejects(T.saveSettings(rev, s.at, { pass_pct: 0 }), /Pass mark/);
  const g = await T.getRevision(rev);
  assert.equal(g.questions[0].prompt_html.includes("script"), false); assert.equal(g.rev.pass_pct, 90);
  const half = await T.saveQuestion(rev, s.at, { type: "mc_single", prompt_html: "Half done", config: { choices: ["a", ""], correct: 0 } });
  await assert.rejects(T.publish(rev, half.at, {}, "t"), /Question 2/, "unfinished questions block publishing");
  await T.deleteQuestion(rev, half.at, half.id);
  const p = await T.publish(rev, await at(), {}, "tester");
  assert.equal(p.kind, "major");
  const pub = await T.getRevision(rev);
  assert.deepEqual([pub.rev.status, pub.rev.tampered, pub.rev.change_note], ["published", false, "First version."]);
  await assert.rejects(T.saveSettings(rev, pub.rev.at, { pass_pct: 50 }), /published/);
  // the database refuses even a direct write
  await assert.rejects(c.query("UPDATE rev_questions SET points = 5 WHERE revision_id = $1", [rev]), /can't change/);
  await assert.rejects(c.query("INSERT INTO rev_questions (revision_id, position, type) VALUES ($1, 9, 'true_false')", [rev]), /can't change/);
  await assert.rejects(c.query("DELETE FROM rev_questions WHERE revision_id = $1", [rev]), /can't change/);
  await assert.rejects(c.query("UPDATE test_revisions SET pass_pct = 10 WHERE id = $1", [rev]), /can't be edited/);
  await assert.rejects(c.query("UPDATE test_revisions SET status = 'draft' WHERE id = $1", [rev]), /back to a draft/);
  await assert.rejects(c.query("DELETE FROM test_revisions WHERE id = $1", [rev]), /can't be deleted/);
  await assert.rejects(T.deleteTest(id, "t"), /archived/);
  // tampering is visible
  await c.query("ALTER TABLE rev_questions DISABLE TRIGGER rev_questions_guard"); await c.query("UPDATE rev_questions SET points = 9 WHERE revision_id = $1", [rev]); await c.query("ALTER TABLE rev_questions ENABLE TRIGGER rev_questions_guard");
  assert.equal((await T.getRevision(rev)).rev.tampered, true);
});

test("a new draft copies the published revision with the same question keys; publishing retires the old one; minor needs a note", { skip }, async () => {
  const { T, id, rev, at, c } = await setup();
  const a = await T.saveQuestion(rev, await at(), mc("Q1")), b = await T.saveQuestion(rev, a.at, mc("Q2"));
  await T.reorderQuestions(rev, b.at, [b.id, a.id]);
  await T.publish(rev, await at(), {}, "t");
  const d = await T.newDraft(id, "t"); assert.notEqual(d, rev); assert.equal(await T.newDraft(id, "t"), d, "one draft at a time");
  const [r1, r2] = [await T.getRevision(rev), await T.getRevision(d)];
  assert.equal(r2.rev.rev_no, 2); assert.deepEqual(r2.questions.map((q) => q.qkey), r1.questions.map((q) => q.qkey)); assert.deepEqual(r2.questions.map((q) => q.prompt_html), ["Q2", "Q1"], "order carries over");
  assert.equal((await c.query("SELECT count(*)::int n FROM rev_questions WHERE revision_id = $1", [rev])).rows[0].n, 2, "the published revision is untouched");
  const fix = await T.saveQuestion(d, r2.rev.at, { ...mc("Q2 fixed"), id: r2.questions[0].id });
  const cmp = await T.compare(rev, d); assert.equal(cmp.suggest, "minor"); assert.equal(cmp.changed.length, 1);
  await assert.rejects(T.publish(d, fix.at, { kind: "minor", note: "" }, "t"), /Describe what changed/);
  await assert.rejects(T.publish(d, fix.at, { note: "typo fix" }, "t"), /major or minor/);
  await T.publish(d, fix.at, { kind: "minor", note: "Fixed a typo in Q2" }, "t");
  assert.deepEqual((await T.getTest(id)).revisions.map((r) => [r.rev_no, r.status]), [[2, "published"], [1, "retired"]]);
  assert.equal((await c.query("SELECT 1 FROM audit WHERE action = 'training.test.publish' AND target LIKE $1", [`Test #${id}:%`])).rowCount, 2);
  // changing the answer is major
  const d3 = await T.newDraft(id, "t"), g3 = await T.getRevision(d3);
  const k = await T.saveQuestion(d3, g3.rev.at, { ...mc("Q1", 1), id: g3.questions[1].id });
  assert.equal((await T.compare(d, d3)).suggest, "major"); void k;
  // discarding the draft keeps the published revision
  await T.discardDraft(d3, "t"); assert.equal((await T.getRevision(d3)), null); assert.equal((await T.getRevision(d)).rev.status, "published");
});

test("never-published tests can be deleted, a lone draft can't be discarded; archiving; affected count; import/export; preview", { skip }, async () => {
  const { T, c, tool, id, rev, at } = await setup();
  await assert.rejects(T.discardDraft(rev, "t"), /Delete the test instead/);
  const a = await T.saveQuestion(rev, await at(), mc("Q1"));
  const x = await T.exportRevision(rev); assert.equal(x.questions.length, 1);
  const copy = await setup(), imp = await T.importIntoDraft(copy.rev, await copy.at(), { ...x, settings: { pass_pct: 70 } });
  const g = await T.getRevision(copy.rev); assert.deepEqual([g.questions.length, g.rev.pass_pct], [1, 70]); void imp;
  assert.notEqual(g.questions[0].qkey, x.questions[0].qkey, "another test's question key is not reused");
  await T.publish(rev, await at(), {}, "t"); const d2 = await T.newDraft(id, "t"), g2 = await T.getRevision(d2);
  await T.importIntoDraft(d2, g2.rev.at, x); assert.equal((await T.getRevision(d2)).questions[0].qkey, x.questions[0].qkey, "the same test keeps its question keys");
  await assert.rejects(T.importIntoDraft(rev, await at(), { format: "other" }), /isn't a training test/);
  const pv = await T.previewQuestions(rev, 1); assert.equal(pv.questions.length, 1); assert.equal(JSON.stringify(pv).includes('"correct"'), false);
  const gr = await T.previewGrade(rev, { [a.id]: 0 }); assert.deepEqual([gr.pct, gr.passed, gr.per[0].answer], [100, true, "[x] Yes | No"]);
  assert.equal((await T.previewGrade(rev, { [a.id]: 1 })).passed, false);
  const u = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'A', now()) RETURNING id", [`a${Date.now()}@example.org`])).rows[0].id;
  await c.query("INSERT INTO tool_auths (user_id, tool_id) VALUES ($1,$2)", [u, tool]);
  assert.equal(await T.affectedCount(id), 1);
  await c.query("UPDATE tool_auths SET expires_on = current_date - 3 WHERE user_id = $1", [u]); assert.equal(await T.affectedCount(id), 0, "lapsed people aren't affected");
  await T.archiveTest(id, true, "t"); assert.ok((await T.toolsWithoutTest()).some((t) => t.id === tool), "archiving frees the tool");
  const id2 = await T.createTest(tool, "second", "t"); await assert.rejects(T.archiveTest(id, false, "t"), /another test/);
  await T.deleteTest(id2, "t"); assert.equal(await T.getTest(id2), null);
});

test("two simultaneous creates for one tool: one wins, one is told the tool has a test", { skip }, async () => {
  const { conn } = await import("../lib/db.ts"), T = await import("../lib/training/tests.ts");
  const c = await conn(), tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Race ${Date.now()}`])).rows[0].id;
  const r = await Promise.allSettled([T.createTest(tool, "a", "t"), T.createTest(tool, "b", "t"), T.createTest(tool, "c", "t")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1); assert.ok(r.filter((x) => x.status === "rejected").every((x) => /already has a test/.test(x.reason.message)));
});
