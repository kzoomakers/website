// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
process.env.ALLOW_DEV_ADMIN = "1"; // a full administrator whose email is "dev"
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("retrieve logs and returns together; failures write nothing; the chain checks out; self views keep the viewer id", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const P = await import("../lib/pii.ts");
  const c = await conn(), email = `pii-${Date.now()}@example.org`;
  const id = (await c.query("INSERT INTO site_users (email, name, first_name, last_name, phone, verified_at) VALUES ($1,'Pii Test','Pii','Test','269-555-0142', now()) RETURNING id", [email])).rows[0].id;
  const count = async () => (await c.query("SELECT count(*)::int n FROM pii_access")).rows[0].n;
  const req = new Request("http://x/api/pii/retrieve", { method: "POST", headers: { "user-agent": "test", "fly-client-ip": "9.9.9.9" } });
  await P.saveCfg({ locked: false });
  const before = await count();
  await assert.rejects(P.retrieve(req, "personal", { type: "member", id }, "", ""), /Choose a reason/);
  await assert.rejects(P.retrieve(req, "personal", { type: "member", id: 2147483000 }, "tour", ""), /Nothing on file/);
  assert.equal(await count(), before, "a refused or failed retrieval leaves no row");
  const d = await P.retrieve(req, "personal", { type: "member", id }, "tour", "visit");
  assert.equal(d.phone, "269-555-0142");
  const row = (await c.query("SELECT * FROM pii_access WHERE subject_id = $1 AND via = 'ui' ORDER BY id DESC LIMIT 1", [id])).rows[0];
  assert.deepEqual([row.viewer_email, row.viewer_is_admin, row.kind, row.reason, row.ip], ["dev", true, "personal", "tour", "9.9.9.9"]);
  await P.saveCfg({ locked: true });
  await assert.rejects(P.retrieve(req, "personal", { type: "member", id }, "tour", ""), /switched off/);
  await P.saveCfg({ locked: false });
  await P.logSelf(req, { id, email }, { type: "member", id }, "id", "Pii Test", ["id_image"]);
  await P.logSelf(req, { id, email }, { type: "member", id }, "id", "Pii Test", ["id_image"]);
  const self = (await c.query("SELECT viewer_id FROM pii_access WHERE via = 'self' AND viewer_email = $1", [email])).rows;
  assert.deepEqual(self.map((r) => r.viewer_id), [id], "repeat self views within ten minutes are one row, with the viewer id");
  assert.equal((await P.verifyChain()).ok, true);
  await c.query("DELETE FROM site_users WHERE id = $1", [id]);
});

test("HTTP correlation: a google:/site: user matches their access row; edits and uploads are never copied", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const P = await import("../lib/pii.ts");
  const c = await conn(), tag = "t" + Date.now();
  await c.query(`CREATE TABLE IF NOT EXISTS http_log (id bigserial, at timestamptz NOT NULL DEFAULT now(), ip text NOT NULL DEFAULT '', method text NOT NULL, host text NOT NULL DEFAULT '', path text NOT NULL, query text NOT NULL DEFAULT '', params jsonb NOT NULL DEFAULT '{}', ua text NOT NULL DEFAULT '', referer text NOT NULL DEFAULT '', "user" text NOT NULL DEFAULT '', status smallint NOT NULL DEFAULT 0)`);
  const { rows: [u] } = await c.query("INSERT INTO site_users (email, name, first_name, last_name, verified_at) VALUES ($1,'Http Test','Http','Test', now()) RETURNING id", [`${tag}@example.org`]);
  const req = new Request("http://x/api/pii/retrieve", { method: "POST" });
  await P.retrieve(req, "personal", { type: "member", id: u.id }, "tour", ""); // viewer "dev"
  const ins = (method, path, user) => c.query(`INSERT INTO http_log (method, path, status, "user", ip) VALUES ($1,$2,200,$3,$4)`, [method, path, user, tag]);
  await ins("POST", "/api/pii/retrieve", "google:dev"); // explained by the row above
  await ins("POST", "/api/pii/retrieve", "google:someone-else@example.org"); // same route, different person: not explained
  await ins("PUT", "/api/webmaster/users/1", "google:dev"); // an edit
  await ins("POST", "/api/guests/photo", ""); // an upload
  await P.copyHttpHits();
  const mine = (await P.httpHits(true)).filter((h) => h.ip === tag);
  assert.deepEqual(mine.map((h) => h.user), ["google:someone-else@example.org"], "only the unexplained read is flagged");
  const all = (await P.httpHits(false)).filter((h) => h.ip === tag);
  assert.equal(all.length, 2, "edits and uploads were never copied");
  assert.ok(all.some((h) => h.user === "google:dev" && h.access_id), "prefix stripped before comparing");
  assert.ok((await P.httpHits(false, 0, new Date().toISOString().slice(0, 7))).length >= 2, "month filter works");
  await c.query("DELETE FROM site_users WHERE id = $1", [u.id]);
});
