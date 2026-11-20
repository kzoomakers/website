import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_EMAILS = "boss@gmail.com,@kzoomakers.org";
const { googleAdminOk } = await import("../auth.ts");

test("Google admin rule: verified, on the list, and a Workspace account for domain entries", () => {
  assert.equal(googleAdminOk({ email: "boss@gmail.com", email_verified: true }), true, "exact address needs no hosted domain");
  assert.equal(googleAdminOk({ email: "a@kzoomakers.org", email_verified: true, hd: "kzoomakers.org" }), true);
  assert.equal(googleAdminOk({ email: "a@kzoomakers.org", email_verified: true }), false, "a personal Google account using that address is refused");
  assert.equal(googleAdminOk({ email: "boss@gmail.com", email_verified: false }), false);
  assert.equal(googleAdminOk({ email: "x@gmail.com", email_verified: true }), false);
  assert.equal(googleAdminOk(null), false);
});
