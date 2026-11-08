// Run with `npm test`. Admin sign-in only ever lands inside /admin.
import { test } from "node:test";
import assert from "node:assert";

const { adminNext } = await import("../lib/admin-next.ts");

test("kept under /admin; everything else falls back to /admin", () => {
  assert.equal(adminNext("/admin/mail?x=1"), "/admin/mail?x=1");
  for (const bad of ["//evil.com", "/admin-login", "/adminx", "https://evil.com", "/members", "", undefined]) assert.equal(adminNext(bad), "/admin");
});
