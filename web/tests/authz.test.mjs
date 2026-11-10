// Run with `npm test`. Who counts as an admin, how section access resolves, and that no API route is left unguarded by accident.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
process.env.ADMIN_EMAILS = "Boss@x.org, @kzoomakers.org";
import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const { isAdmin } = await import("../auth.ts");
const { levelOf } = await import("../lib/guard.ts");

test("admin allow-list: exact address or whole domain, never a lookalike", () => {
  assert.ok(isAdmin("boss@X.org") && isAdmin("a@kzoomakers.org"));
  for (const e of ["", null, undefined, "boss@x.org.evil.com", "a@evilkzoomakers.org", "a@sub.kzoomakers.org.evil.com"]) assert.ok(!isAdmin(e), String(e));
});

test("admin:write reaches every section; other levels stay in their own section", () => {
  assert.equal(levelOf(null, "mail"), undefined);
  assert.equal(levelOf({ perms: { admin: "write" } }, "crm"), "write");
  assert.equal(levelOf({ perms: { admin: "read" } }, "crm"), undefined); // reading Admin is not admin
  assert.equal(levelOf({ perms: { blog: "read" } }, "blog"), "read");
  assert.equal(levelOf({ perms: { blog: "read" } }, "mail"), undefined);
});

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
test("an API route with no auth check must be on the reviewed public list", () => {
  const PUBLIC = new Set(["tours", "contact", "calendar", "subscribe", "hours", "auth/[...nextauth]", "links/click", "blog/auth/password", "ga/tag", "privacy"].map((p) => `app/api/${p}/route.ts`));
  const guarded = /editingAllowed|current(Member|Verified|Applicant)|keyAllows|gate\(|\bme\(\)|auth\(\)|access\(|token|isAdmin|getSession|byToken/;
  // Comments don't count, only real code.
  for (const f of walk("app/api").filter((f) => f.endsWith("route.ts")))
    if (!guarded.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
      assert.ok(PUBLIC.has(f), `${f} has no auth check: guard it, or add it here if it is meant to be public`);
});

test("post-login redirect (safeNext) only ever stays on this site", async () => {
  const { safeNext } = await import("../lib/readers.ts");
  for (const ok of ["/members/inbox", "/blog/a-post?x=1#c"]) assert.equal(safeNext(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/a b", "/<script>", "", null, undefined]) assert.equal(safeNext(bad), "/", String(bad));
});

test("a signing redirect address must be http(s): javascript:, data: and the like are refused", async () => {
  const { cleanSetup } = await import("../lib/sign.ts");
  const s = [{ name: "A", email: "a@x.org", role: "signer" }], mk = (u) => () => cleanSetup({ signers: s, redirect_url: u }, 0, false);
  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "//evil.com", "ftp://x.org"]) assert.throws(mk(bad), /http/, bad);
  assert.doesNotThrow(mk("https://example.org/thanks"));
  assert.doesNotThrow(mk(""));
});
