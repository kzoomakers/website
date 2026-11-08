// Run with `npm test`. Requests from internal addresses are not written to the HTTP log.
import { test } from "node:test";
import assert from "node:assert";
const { skipped } = await import("../lib/httplog-util.ts");

test("the two internal addresses are skipped, mapped or plain; others are logged", () => {
  assert.ok(skipped("::ffff:172.19.19.81") && skipped("::ffff:172.19.31.1") && skipped("172.19.31.1"));
  assert.ok(!skipped("::ffff:172.19.19.82") && !skipped("8.8.8.8") && !skipped(""));
});

const { staticPath, statusOf, webLike } = await import("../lib/httplog-util.ts");
test("static files are not logged; a visitor who hung up is 499", () => {
  assert.ok(staticPath("/_next/static/x.js") && staticPath("/favicon.ico") && !staticPath("/about"));
  assert.equal(statusOf(200, true), 200);
  assert.equal(statusOf(200, false), 499);
});
test("a Node request is read like a web one (https behind the proxy, joined repeat headers)", () => {
  const w = webLike({ url: "/a?b=1", method: "POST", headers: { host: "x.org", "x-forwarded-proto": "https, http", cookie: ["a=1", "b=2"] } });
  assert.equal(w.url, "https://x.org/a?b=1");
  assert.equal(w.method, "POST");
  assert.equal(w.headers.get("Cookie"), "a=1, b=2");
  assert.equal(w.headers.get("nope"), null);
});
