// Run with `npm test`. The debug log must never hold a credential: masked with ten bullets.
import { test } from "node:test";
import assert from "node:assert";
import { MASK, redact, redactBody, redactHeaders, scrubText } from "../lib/redact.ts";

test("mask is ten bullets", () => assert.equal(MASK, "••••••••••"));

test("headers: credentials masked (scheme kept), others untouched", () => {
  const h = redactHeaders({ Authorization: "Bearer sk-or-v1-abcdef123456", "X-Api-Key": "abc", Cookie: "a=b", "Content-Type": "application/json", "set-cookie": "s=1" });
  assert.equal(h.authorization, `Bearer ${MASK}`);
  assert.equal(h["x-api-key"], MASK);
  assert.equal(h.cookie, MASK);
  assert.equal(h["set-cookie"], MASK);
  assert.equal(h["content-type"], "application/json");
});

test("bodies: credential fields masked at any depth; token COUNTS are kept", () => {
  const b = redact({ model: "m", max_tokens: 100, usage: { total_tokens: 7 }, auth: { api_key: "x1", access_token: "x2", clientSecret: "x3" }, list: [{ password: "p" }] });
  assert.equal(b.max_tokens, 100);
  assert.equal(b.usage.total_tokens, 7);
  assert.deepEqual(b.auth, { api_key: MASK, access_token: MASK, clientSecret: MASK });
  assert.equal(b.list[0].password, MASK);
});

test("text: bearer tokens, sk- keys, url key params and known secrets are removed wherever they appear", () => {
  const t = scrubText("Authorization: Bearer abcdef123456 and sk-live_abcdefgh12 at https://x/y?key=SECRET99&z=1 plus MYKEYVALUE here", ["MYKEYVALUE"]);
  for (const s of ["abcdef123456", "sk-live_abcdefgh12", "SECRET99", "MYKEYVALUE"]) assert.ok(!t.includes(s), s);
  assert.ok(t.includes("z=1"));
});

test("a provider echoing the key inside a JSON string is still scrubbed; huge strings are cut", () => {
  const b = redactBody(JSON.stringify({ error: { message: "Invalid key supersecretvalue1" } }), ["supersecretvalue1"]);
  assert.ok(!JSON.stringify(b).includes("supersecretvalue1"));
  assert.ok(scrubText("a".repeat(60_000)).length < 51_000);
});

test("a Google secret calendar link loses its secret part", () => {
  const t = scrubText("https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-0123456789abcdef0123/basic.ics");
  assert.ok(!t.includes("0123456789abcdef0123") && t.includes("/private-" + MASK + "/basic.ics"));
});
