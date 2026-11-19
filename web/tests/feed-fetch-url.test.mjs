// Run with `npm test`. The SSRF rules from Lobsters' sponge.rb, against a real local server.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const { isBadIp, resolvePublic, safeGet, parseHtmlAttributes, once } = await import("../feed/fetch-url.ts");

test("private, loopback, link-local and metadata ranges are refused", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255"]) assert.ok(isBadIp(ip), ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "93.184.216.34", "100.128.0.1"]) assert.ok(!isBadIp(ip), ip);
});

test("a hostname with any private record is refused; a public one resolves", async () => {
  await assert.rejects(resolvePublic("evil.example", async () => ["8.8.8.8", "10.0.0.5"]));
  await assert.rejects(resolvePublic("evil.example", async () => []));
  await assert.rejects(resolvePublic("x.example", async () => { throw new Error("NXDOMAIN"); }));
  assert.equal(await resolvePublic("ok.example", async () => ["93.184.216.34"]), "93.184.216.34");
  await assert.rejects(resolvePublic("127.0.0.1"));
  await assert.rejects(resolvePublic("::1"));
});

test("a local server on 127.0.0.1 is unreachable, directly or by hostname or redirect", async () => {
  let hits = 0;
  const srv = http.createServer((q, s) => { hits++; if (q.url === "/r") { s.writeHead(302, { location: `http://127.0.0.1:${srv.address().port}/` }); s.end(); } else s.end("<title>secret</title>"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  assert.equal(await safeGet(`http://127.0.0.1:${port}/`), null, "loopback and a non-standard port");
  assert.equal(await safeGet(`http://rebind.example/`, { lookup: async () => ["127.0.0.1"] }), null, "hostname resolving to loopback");
  assert.equal(await safeGet(`http://localhost/`), null);
  assert.equal(await safeGet(`ftp://example.com/`), null);
  assert.equal(await safeGet(`http://user:pw@example.com/`), null);
  srv.close();
  assert.equal(hits, 0, "nothing ever reached the server");
});

test("title extraction follows story.rb", () => {
  assert.deepEqual(parseHtmlAttributes("<title>  Hello \n World </title>", "https://e.com/a"), { title: "Hello World", canonical: undefined });
  assert.equal(parseHtmlAttributes(`<meta property="og:title" content="OG | Site"><meta property="og:site_name" content="Site"><title>x</title>`, "https://e.com/a").title, "OG");
  assert.equal(parseHtmlAttributes("<title>GitHub - octocat/Hello-World: demo</title>", "https://github.com/octocat/Hello-World").title, "Hello-World: demo");
  assert.equal(parseHtmlAttributes(`<link rel="canonical" href="/b"><title>t</title>`, "https://e.com/a").canonical, "https://e.com/b");
  assert.equal(parseHtmlAttributes(`<link rel="canonical" href="/"><title>t</title>`, "https://e.com/a").canonical, undefined, "domain root is not offered");
});

test("the pinned connection works on this Node: the hostname never resolves, the vetted address is used", async () => {
  // once() is what safeGet calls after vetting; port 80 can't be bound here, so it is tested directly with a local server.
  const srv = http.createServer((q, s) => s.end(`<title>pinned ${q.headers.host.startsWith("pinned.example")}</title>`));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const r = await once(new URL(`http://pinned.example:${srv.address().port}/x`), "127.0.0.1", 2000);
  srv.close();
  assert.equal(r.status, 200);
  assert.match(r.body.toString(), /pinned true/, "sent the original Host header to the pinned address");
});
