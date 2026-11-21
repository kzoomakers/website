// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("trainer, rollout and audit reports run and show seeded rows; the board email goes once and only for a month with overrides", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const R = await import("../lib/training/reports.ts"), N = await import("../lib/training/notify.ts"), S = await import("../lib/training/settings.ts"), { logAudit } = await import("../lib/store.ts");
  await S.saveTrainingCfg({ enabled: true });
  const c = await conn(), n = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const u = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'Pat', now()) RETURNING id", [`p${n}@x.test`])).rows[0].id;
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Lathe ${n}`])).rows[0].id;
  const ce = (await c.query("INSERT INTO certifications (user_id, tool_id, state, certified_at) VALUES ($1,$2,'certified', now()) RETURNING id", [u, tool])).rows[0].id;
  await c.query("INSERT INTO cert_events (cert_id, actor, kind, note) VALUES ($1,$2,'certified','ok')", [ce, `trainer${n}@x.test`]);
  await logAudit(`trainer${n}@x.test`, "training.cert.note", `note ${n}`);
  assert.equal((await R.REPORTS.trainers()).find((r) => r.trainer === `trainer${n}@x.test`).signed_off, 1);
  assert.ok((await R.REPORTS.audit()).some((r) => r.target === `note ${n}`));
  await R.REPORTS.rollouts(); // runs (no rollout needed)
  const now = new Date(), prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 17));
  await c.query("INSERT INTO cert_events (cert_id, actor, at, kind, note, data) VALUES ($1,'lead@x.test',$2,'override','board test ' || $3::text,'{\"how\":\"waive_test\"}')", [ce, prev, n]);
  await c.query("DELETE FROM training_mail_log WHERE key LIKE 'board-overrides:%'"); // the marker is per month for the whole site: clear a leftover from an earlier run
  const queued = async () => (await c.query("SELECT count(*)::int AS n FROM mail_queue WHERE msg::text LIKE $1", [`%board test ${n}%`])).rows[0].n;
  assert.equal(await N.boardOverrides(now), true);
  assert.equal(await queued(), 1, "one mail with the override in it");
  assert.equal(await N.boardOverrides(now), false, "once per month");
  assert.equal(await queued(), 1);
});
