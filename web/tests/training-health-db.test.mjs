// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("a tracked job records its run and its failure; the stale-sweep alert is quiet until Pushover is set up", { skip }, async () => {
  const H = await import("../lib/training/health.ts"), S = await import("../lib/training/settings.ts");
  await S.saveTrainingCfg({ enabled: true });
  await H.tracked("sweep", async () => 1)();
  let h = (await H.jobHealth()).jobs.find((j) => j.job === "sweep");
  assert.ok(h.at && h.ok);
  await assert.rejects(H.tracked("sweep", async () => { throw new Error("boom"); })());
  h = (await H.jobHealth()).jobs.find((j) => j.job === "sweep");
  assert.equal(h.ok, false); assert.equal(h.error, "boom");
  assert.equal(await H.checkSweep(Date.now() + 4 * 3600_000), false, "stale, but no Pushover group configured");
});
