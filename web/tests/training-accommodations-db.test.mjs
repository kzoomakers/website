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
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Lathe ${n}`])).rows[0].id;
  const user = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'M', now()) RETURNING id", [`acc${n}@x.test`])).rows[0].id;
  const trainer = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'T', now()) RETURNING id", [`tr${n}@x.test`])).rows[0].id;
  await c.query("INSERT INTO tool_trainers (tool_id, user_id) VALUES ($1,$2)", [tool, trainer]);
  const id = await T.createTest(tool, "", "t"), r = (await T.getTest(id)).revisions[0].id;
  const q = await T.saveQuestion(r, (await T.getRevision(r)).rev.at, { type: "true_false", prompt_html: "Safe?", points: 1, config: { correct: true } });
  if (Object.keys(rev).length) await T.saveSettings(r, q.at, rev);
  await T.publish(r, (await T.getRevision(r)).rev.at, {}, "t");
  return { c, A, id, tool, user, trainer, trainerEmail: `tr${n}@x.test`, userEmail: `acc${n}@x.test` };
};

test("extra time scales the limit and is copied onto the attempt; later changes don't touch it", { skip }, async () => {
  const { c, A, id, user, trainer, trainerEmail, userEmail } = await setup({ time_limit_min: 10 });
  const Acc = await import("../lib/training/accommodations.ts");
  const actor = { id: trainer, email: trainerEmail, all: false, view: false };
  await Acc.setAccommodation(actor, user, { time_multiplier: 1.5, read_aloud: true, notes: "reader" });
  const v = await A.start(user, id);
  assert.deepEqual(v.accommodation, { time_multiplier: 1.5, read_aloud: true });
  const ms = new Date(v.due_at).getTime() - Date.now();
  assert.ok(ms > 14 * 60_000 && ms <= 15 * 60_000 + 5000, `due in about 15 minutes, got ${ms}ms`);
  await Acc.setAccommodation(actor, user, { time_multiplier: 1, read_aloud: false });
  const row = (await c.query("SELECT time_multiplier::float AS m, read_aloud FROM attempts WHERE id = $1", [v.attemptId])).rows[0];
  assert.deepEqual([row.m, row.read_aloud], [1.5, true], "the attempt keeps what it started with");
  assert.equal((await A.start(user, id)).accommodation.time_multiplier, 1.5, "a resumed attempt too");
  assert.equal(userEmail.includes("@"), true);
});

test("only trainers set accommodations, never their own, and only from the list", { skip }, async () => {
  const { user, trainer, trainerEmail } = await setup();
  const Acc = await import("../lib/training/accommodations.ts");
  const member = { id: user, email: "m@x.test", all: false, view: false };
  await assert.rejects(Acc.setAccommodation(member, trainer, { time_multiplier: 1.5 }), /Only trainers/);
  await assert.rejects(Acc.setAccommodation({ id: trainer, email: trainerEmail, all: false, view: false }, trainer, { time_multiplier: 1.5 }), /your own/);
  await assert.rejects(Acc.setAccommodation({ id: trainer, email: trainerEmail, all: false, view: false }, user, { time_multiplier: 3 }), /list/);
  assert.deepEqual(await Acc.setAccommodation({ id: trainer, email: trainerEmail, all: false, view: false }, user, { time_multiplier: 1.25, read_aloud: false }), { ok: true });
});
