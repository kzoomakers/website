// Run with `npm test`. The debug "trace" of outgoing requests: it masks credentials, leaves the caller's response readable, and costs nothing when off.
import { test, mock } from "node:test";
import assert from "node:assert";

const { tracedFetch } = await import("../lib/debug.ts");
const realFetch = globalThis.fetch;
const streams = (on) => { globalThis.dbg = { at: Date.now(), on }; };
const capture = () => { const out = []; const log = mock.method(console, "log", (...a) => out.push(a.join(" "))); mock.method(console, "error", (...a) => out.push(a.join(" "))); return { out, done: () => mock.restoreAll() }; };

test("on: logs both directions with every credential masked, and the caller can still read the body", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "bad key KEY-123456-SECRET", usage: { total_tokens: 5 } }), { status: 401, headers: { "set-cookie": "sess=abc", "content-type": "application/json" } });
  streams({ "ai-openrouter": true });
  const c = capture();
  try {
    const r = await tracedFetch("ai-openrouter", "https://x.test/v1/chat?key=URLKEY12345", { method: "POST", headers: { authorization: "Bearer KEY-123456-SECRET" }, body: JSON.stringify({ max_tokens: 9, messages: [{ role: "user", content: "hello" }] }) }, ["KEY-123456-SECRET"]);
    assert.equal(r.status, 401);
    assert.deepEqual((await r.json()).usage, { total_tokens: 5 }); // clone, not consumed
  } finally { c.done(); globalThis.fetch = realFetch; }
  const all = c.out.join("\n");
  assert.equal(c.out.length, 2); // request line + response line
  assert.ok(all.includes("→ POST") && all.includes("← 401") && all.includes("hello") && all.includes("Bearer ••••••••••"));
  for (const secret of ["KEY-123456-SECRET", "URLKEY12345", "sess=abc"]) assert.ok(!all.includes(secret), secret);
});

test("a network failure is logged and rethrown", async () => {
  globalThis.fetch = async () => { throw new Error("connect refused"); };
  streams({ "ai-deepseek": true });
  const c = capture();
  try { await assert.rejects(tracedFetch("ai-deepseek", "https://x.test/"), /connect refused/); } finally { c.done(); globalThis.fetch = realFetch; }
  assert.ok(c.out.join("\n").includes("connect refused"));
});

test("off: it is plain fetch, nothing is logged", async () => {
  let calls = 0;
  globalThis.fetch = async () => (calls++, new Response("ok"));
  streams({});
  const c = capture();
  try { assert.equal(await (await tracedFetch("ai-openrouter", "https://x.test/", { headers: { authorization: "Bearer abcdef123456" } })).text(), "ok"); } finally { c.done(); globalThis.fetch = realFetch; }
  assert.equal(calls, 1);
  assert.deepEqual(c.out, []);
});
