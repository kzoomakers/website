// Run with `npm test`. Multi-file uploads run two at a time, keep their order, don't stop on a failure, and wait out a "server busy" answer.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";

const { uploadBatch, sendUpload } = await import("../lib/upload-client.ts");
const { ImageError, imageFail } = await import("../lib/image.ts");

test("uploadBatch: never more than 2 at once, results in order, a failure doesn't stop the rest", async () => {
  let now = 0, peak = 0;
  const files = Array.from({ length: 7 }, (_, i) => ({ i }));
  const seen = [];
  const out = await uploadBatch(files, async (f) => {
    peak = Math.max(peak, ++now);
    await new Promise((r) => setTimeout(r, 10));
    now--;
    if (f.i === 3) throw new Error("bad file");
    return f.i;
  }, (d, n) => seen.push([d, n]));
  assert.equal(peak, 2);
  assert.deepEqual(out.map((x) => (x instanceof Error ? x.message : x)), [0, 1, 2, "bad file", 4, 5, 6]);
  assert.deepEqual(seen.at(-1), [7, 7]);
});

test("sendUpload waits out a 503 busy answer and then goes through; other answers are returned as they are", async () => {
  const answers = [new Response("busy", { status: 503, headers: { "retry-after": "0.01" } }), new Response("busy", { status: 503, headers: { "retry-after": "0.01" } }), new Response("ok")];
  let calls = 0;
  globalThis.fetch = async () => { calls++; return answers.shift(); };
  assert.equal(await (await sendUpload("/x", new FormData())).text(), "ok");
  assert.equal(calls, 3);
  globalThis.fetch = async () => new Response("nope", { status: 400 });
  assert.equal((await sendUpload("/x", new FormData())).status, 400);
});

test("busy is a 503 with Retry-After; any other upload error is a 400 with its message", async () => {
  const busy = imageFail(new ImageError("busy", 503));
  assert.deepEqual([busy.status, busy.headers.get("retry-after")], [503, "5"]);
  const bad = imageFail(new ImageError("That image couldn't be read."));
  assert.deepEqual([bad.status, bad.headers.get("retry-after"), await bad.text()], [400, null, "That image couldn't be read."]);
});
