// Page scripts, rate limiting, sign-in lockout and access rows. The database tests need a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("execParts sees raw HTML blocks (nested too), page scripts and redirects, and ignores ordinary content", async () => {
  const { execParts } = await import("../lib/page-exec.ts");
  const plain = { content: [{ type: "Hero", props: { title: "Hi" } }], root: { props: { title: "x" } } };
  assert.equal(execParts(plain), execParts({ ...plain, content: [{ type: "Hero", props: { title: "Changed" } }] }), "text edits are not script changes");
  const html = { ...plain, content: [...plain.content, { type: "HtmlSection", props: { html: "<p>a</p>" } }] };
  assert.notEqual(execParts(html), execParts(plain), "adding a raw HTML block");
  assert.notEqual(execParts(html), execParts({ ...plain, content: [{ type: "HtmlSection", props: { html: "<p>b</p>" } }] }));
  assert.notEqual(execParts({ ...plain, zones: { z: [{ type: "HtmlSection", props: { html: "<script>1</script>" } }] } }), execParts(plain), "a block inside a zone");
  assert.notEqual(execParts({ ...plain, root: { props: { inline: [{ code: "alert(1)" }] } } }), execParts(plain), "inline script");
  assert.notEqual(execParts({ ...plain, root: { props: { scripts: [{ src: "//x" }] } } }), execParts(plain), "external script");
  assert.notEqual(execParts({ ...plain, root: { props: { refresh: "0;url=//x" } } }), execParts(plain), "redirect");
});

test("hit(): a burst of parallel requests passes exactly `max`", { skip }, async () => {
  const { hit } = await import("../lib/limit.ts");
  const key = "test:burst:" + Date.now();
  const r = await Promise.all(Array.from({ length: 30 }, () => hit(key, 5, 60_000)));
  assert.equal(r.filter(Boolean).length, 5);
});

test("password sign-in: 5 misses from one address lock that address, 50 from anywhere lock the account; fewer do not", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { passwordLogin } = await import("../lib/readers.ts");
  const c = await conn(), email = `lock-${Date.now()}@example.org`;
  const miss = (n, ip) => c.query("INSERT INTO login_fails (email, ip) SELECT $1, $2 FROM generate_series(1, $3)", [email, ip, n]);
  try {
    await miss(4, "1.1.1.1");
    await assert.rejects(passwordLogin(email, "x", "1.1.1.1"), /Wrong email or password/, "4 misses: still just a wrong password");
    await c.query("DELETE FROM login_fails WHERE email = $1", [email]);
    await miss(5, "1.1.1.1");
    await assert.rejects(passwordLogin(email, "x", "1.1.1.1"), /Too many attempts/);
    await assert.rejects(passwordLogin(email, "x", "2.2.2.2"), /Wrong email or password/, "the real owner on another address is not locked out");
    await c.query("DELETE FROM login_fails WHERE email = $1", [email]);
    await miss(50, "3.3.3.3");
    await assert.rejects(passwordLogin(email, "x", "2.2.2.2"), /Too many attempts/, "a spread-out guesser still stops");
  } finally { await c.query("DELETE FROM login_fails WHERE email = $1", [email]); }
});

test("access rows: a page grant adds one page, a whole-section grant replaces page rows, removing it clears them", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { setAccess } = await import("../lib/users.ts");
  const c = await conn(), email = `perm-${Date.now()}@example.org`;
  const id = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1, 'Perm Test', now()) RETURNING id", [email])).rows[0].id;
  const rows = async () => (await c.query("SELECT section, level FROM user_perms WHERE user_id = $1 ORDER BY section", [id])).rows.map((r) => `${r.section}=${r.level}`);
  try {
    await setAccess(id, "tours:walkups", "read", "boss@example.org");
    await setAccess(id, "tours:stats", "write", "boss@example.org");
    assert.deepEqual(await rows(), ["tours:stats=write", "tours:walkups=read"]);
    await setAccess(id, "tours", "read", "boss@example.org");
    assert.deepEqual(await rows(), ["tours=read"], "page rows are dropped");
    await assert.rejects(setAccess(id, "tours:walkups", "read", "boss@example.org"), /whole section/);
    await assert.rejects(setAccess(id, "admin:users", "write", "boss@example.org"), Error, "full-admin pages are never granted one by one");
    await setAccess(id, "tours", null, "boss@example.org");
    assert.deepEqual(await rows(), []);
  } finally { await c.query("DELETE FROM user_perms WHERE user_id = $1", [id]); await c.query("DELETE FROM site_users WHERE id = $1", [id]); }
});
