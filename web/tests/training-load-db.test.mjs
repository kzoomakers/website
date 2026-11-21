// Load and concurrency checks for training. Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
// Not part of the quick run: each scenario fires many requests at once, so run this file on its own (see package.json "test:db").
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";
const MEMBERS = 50, SWEEP_ROWS = 3000;

test(`${MEMBERS} members start, and every one double-submits at once: one certification each, one graded attempt each`, { skip, timeout: 240_000 }, async () => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), tag = Date.now();
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Load tool ${tag}`])).rows[0].id;
  const id = await T.createTest(tool, "", "t"), r = (await T.getTest(id)).revisions[0].id;
  await T.saveQuestion(r, (await T.getRevision(r)).rev.at, { type: "true_false", prompt_html: "<p>Ready?</p>", points: 1, config: { correct: true } });
  await T.publish(r, (await T.getRevision(r)).rev.at, {}, "t");
  const qid = (await T.getRevision(r)).questions[0].id;
  const users = (await c.query("INSERT INTO site_users (email, name, verified_at) SELECT 'load' || g || '-' || $1 || '@x.test', 'Load ' || g, now() FROM generate_series(1, $2) g RETURNING id", [tag, MEMBERS])).rows.map((x) => x.id);

  const t0 = Date.now();
  const starts = await Promise.all(users.map((u) => A.start(u, id)));
  const answers = Object.fromEntries([[qid, true]]);
  // Two submits per member, all at once: a double click or two tabs. The second must find the attempt finished.
  const results = await Promise.all(users.flatMap((u, i) => [A.submit(u, starts[i].attemptId, answers), A.submit(u, starts[i].attemptId, answers)]));
  const elapsed = Date.now() - t0;

  assert.equal(results.every((x) => x.passed === true && x.status === "submitted"), true, "every submit returns the same passing result");
  const certs = (await c.query("SELECT user_id, count(*)::int AS n FROM certifications WHERE user_id = ANY($1) AND tool_id = $2 GROUP BY user_id", [users, tool])).rows;
  assert.equal(certs.length, MEMBERS, "every member has a certification");
  assert.ok(certs.every((x) => x.n === 1), "and only one each");
  const attempts = (await c.query("SELECT user_id, count(*)::int AS n FROM attempts WHERE user_id = ANY($1) AND revision_id = $2 AND status = 'submitted' GROUP BY user_id", [users, r])).rows;
  assert.ok(attempts.length === MEMBERS && attempts.every((x) => x.n === 1), "one graded attempt each, however many submits");
  assert.ok(elapsed < 60_000, `the whole burst took ${elapsed}ms`);
});

test(`lapse sweep over ${SWEEP_ROWS} rollout members: held back until a lead confirms, then lapses them all`, { skip, timeout: 240_000 }, async () => {
  const { conn } = await import("../lib/db.ts");
  const S = await import("../lib/training/settings.ts"), RC = await import("../lib/training/recert.ts");
  const c = await conn(), tag = Date.now();
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Sweep tool ${tag}`])).rows[0].id;
  const rev = (await c.query("INSERT INTO tests (title, created_by) VALUES ('sweep', 't') RETURNING id")).rows[0].id;
  const tv = (await c.query("INSERT INTO test_revisions (test_id, rev_no, status, published_at) VALUES ($1, 1, 'published', now()) RETURNING id", [rev])).rows[0].id;
  const ro = (await c.query("INSERT INTO rollouts (revision_id, deadline, created_by) VALUES ($1, (now() AT TIME ZONE 'America/Detroit')::date - 1, 't') RETURNING id", [tv])).rows[0].id;
  await c.query("WITH u AS (INSERT INTO site_users (email, name, verified_at) SELECT 'sweep' || g || '-' || $3 || '@x.test', 'Sweep ' || g, now() FROM generate_series(1, $4) g RETURNING id) INSERT INTO rollout_members (rollout_id, user_id, tool_id, status) SELECT $1, u.id, $2, 'pending' FROM u",
    [ro, tool, tag, SWEEP_ROWS]);

  const t0 = Date.now();
  await RC.lapseSweep(50); // the guard: more than half pending, so nobody lapses yet
  const held = (await c.query("SELECT count(*)::int AS n FROM rollout_members WHERE rollout_id = $1 AND status = 'pending'", [ro])).rows[0].n;
  assert.equal(held, SWEEP_ROWS, "held back by the guard");
  await c.query("UPDATE rollouts SET lapse_ok = true WHERE id = $1", [ro]);
  await RC.lapseSweep(50); // a lead has confirmed
  const lapsed = (await c.query("SELECT count(*)::int AS n FROM rollout_members WHERE rollout_id = $1 AND status = 'lapsed'", [ro])).rows[0].n;
  assert.equal(lapsed, SWEEP_ROWS, "everyone lapses once confirmed");
  assert.ok(Date.now() - t0 < 120_000, `two sweeps over ${SWEEP_ROWS} rows took ${Date.now() - t0}ms`);
});
