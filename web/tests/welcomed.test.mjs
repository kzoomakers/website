// Run with `npm test`. The wizard's "finished" mark only works once the required steps are done, and only once.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "welcomed-")), "config.json");
fs.writeFileSync(file, JSON.stringify({ databaseUrl: "postgres://x", databaseCa: "" }));
process.env.CONFIG_PATH = file; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";

// A fake pool standing in for the database: one user whose step we control.
let step = "waiver", welcomedAt = null;
const pool = { query: async (sql) => /welcomed_at = now/.test(sql) ? (welcomedAt ??= 1, { rowCount: 1 }) : { rows: [{ step }] } };
const { getConfig } = await import("../lib/config.ts");
globalThis.db = { key: JSON.stringify([getConfig().databaseUrl, getConfig().databaseCa]), pool, ready: Promise.resolve() };
const { welcomed } = await import("../lib/onboarding.ts");

test("welcomed is refused before the required steps are done", async () => {
  for (step of ["waiver", "handbook", "id", "profile", "resign"]) await assert.rejects(welcomed(1), /earlier steps/);
  assert.equal(welcomedAt, null);
});

test("welcomed marks the person once the steps are done", async () => {
  step = "done"; await welcomed(1);
  assert.equal(welcomedAt, 1);
});
