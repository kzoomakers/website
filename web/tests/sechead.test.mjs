// Run with `npm test`. Security headers: defaults, exceptions, and that bad stored data can't break a page.
import { test } from "node:test";
import assert from "node:assert";
import { DEFAULTS, headersFor, normalize } from "../lib/sechead.ts";

test("defaults: HSTS only over https, CSP starts report-only", () => {
  assert.ok(headersFor(DEFAULTS, "/", true)["strict-transport-security"]);
  assert.equal(headersFor(DEFAULTS, "/", false)["strict-transport-security"], undefined);
  const h = headersFor(DEFAULTS, "/", true);
  assert.ok(h["content-security-policy-report-only"] && !h["content-security-policy"]);
  assert.equal(h["x-frame-options"], "SAMEORIGIN");
});

test("exceptions skip only the named headers on matching paths", () => {
  const c = normalize({ exceptions: [{ path: "/embed/*", skip: ["frame", "csp"] }, { path: "/one", skip: ["referrer"] }] });
  const h = headersFor(c, "/embed/x", true);
  assert.equal(h["x-frame-options"], undefined);
  assert.equal(h["content-security-policy-report-only"], undefined);
  assert.ok(h["x-content-type-options"]);
  assert.equal(headersFor(c, "/one", true)["referrer-policy"], undefined);
  assert.ok(headersFor(c, "/one/two", true)["referrer-policy"]); // exact path, not a prefix
});

test("master switch, and garbage input falls back to safe values", () => {
  assert.deepEqual(headersFor(normalize({ enabled: false }), "/", true), {});
  const c = normalize({ frame: "ALLOW-ALL", csp: { mode: "bogus", directives: 5 }, hsts: { maxAge: 1e12 }, exceptions: [{ path: "nope" }, { path: "/ok", skip: ["x", "csp"] }] });
  assert.equal(c.frame, "SAMEORIGIN");
  assert.equal(c.csp.mode, "report-only");
  assert.equal(c.hsts.maxAge, 63072000);
  assert.deepEqual(c.exceptions, [{ path: "/ok", skip: ["csp"], note: undefined }]);
});

test("header values can't carry newlines", () => {
  const h = headersFor(normalize({ permissions: "a\r\nx-evil: 1", csp: { mode: "enforce", directives: "default-src 'self'\r\nx: y" } }), "/", true);
  for (const v of Object.values(h)) assert.ok(!/[\r\n]/.test(v));
});
