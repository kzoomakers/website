// The DB tests need a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. The CSV test always runs.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const { toCsv } = await import("../lib/training/reports.ts");

test("csv: formulas are defused, quotes escaped", () => {
  const out = toCsv([{ a: "=cmd()", b: "+1", c: "say \"hi\", ok", d: "@x", e: null }]);
  assert.equal(out, "a,b,c,d,e\r\n'=cmd(),'+1,\"say \"\"hi\"\", ok\",'@x,\r\n");
});

test("overrides: reason, self, effects", { skip: !url && "set TEST_DATABASE_URL" }, async () => {
  const { conn } = await import("../lib/db.ts"), O = await import("../lib/training/overrides.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now();
  await S.saveTrainingCfg({ enabled: true });
  const user = async (t) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id", [`${t}${n}@x.test`, t])).rows[0].id;
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Press ${n}`])).rows[0].id;
  const lead = await user("lead"), m = await user("member"), A = { id: lead, email: `lead${n}@x.test`, all: true, view: true };
  const why = "Transferred from another makerspace";
  await assert.rejects(O.override(A, { how: "certify_now", user: m, tool, reason: "short" }), /reason/);
  await assert.rejects(O.override(A, { how: "certify_now", user: lead, tool, reason: why }), /own/);
  await O.override(A, { how: "certify_now", user: m, tool, reason: why });
  const auth = (await c.query("SELECT source FROM tool_auths WHERE user_id=$1 AND tool_id=$2", [m, tool])).rows[0];
  assert.equal(auth.source, "override");
  assert.equal((await c.query("SELECT 1 FROM cert_events WHERE kind='override' AND note=$1", [why])).rowCount, 1);
  await O.override(A, { how: "revoke", user: m, tool, reason: why });
  assert.equal((await c.query("SELECT 1 FROM tool_auths WHERE user_id=$1 AND tool_id=$2", [m, tool])).rowCount, 0);
  await O.override(A, { how: "credit_prior", user: m, tool, reason: why, date: "2024-01-15" });
  assert.equal((await c.query("SELECT to_char(certified_at AT TIME ZONE 'America/Detroit','YYYY-MM-DD') d FROM certifications WHERE user_id=$1 AND state='certified'", [m])).rows[0].d, "2024-01-15");
});
