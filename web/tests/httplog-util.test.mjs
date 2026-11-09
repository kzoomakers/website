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

const { classify, countable } = await import("../lib/referrers-util.ts");
test("referrers: AI beats search, own site and robots are ignored, utm_source is used when the referrer is hidden", () => {
  assert.deepEqual(classify("https://chatgpt.com/", "", "kzoomakers.org"), { kind: "ai", source: "ChatGPT", host: "chatgpt.com", via: "referrer" });
  assert.equal(classify("", "chatgpt.com", "x.org")?.source, "ChatGPT");
  assert.equal(classify("https://gemini.google.com/app", "", "x.org")?.kind, "ai");
  assert.equal(classify("https://www.google.co.uk/", "", "x.org")?.source, "Google");
  assert.equal(classify("https://l.facebook.com/l.php", "", "x.org")?.kind, "social");
  assert.equal(classify("https://example.com/post", "", "x.org")?.kind, "other");
  assert.equal(classify("https://www.x.org/about", "", "x.org"), null);
  assert.equal(classify("", "", "x.org"), null);
  assert.ok(countable({ method: "GET", status: 200, path: "/about", ua: "Mozilla/5.0" }));
  assert.ok(!countable({ method: "GET", status: 200, path: "/about", ua: "Googlebot" }) && !countable({ method: "GET", status: 404, path: "/a", ua: "" }) && !countable({ method: "GET", status: 200, path: "/api/x", ua: "" }));
});
