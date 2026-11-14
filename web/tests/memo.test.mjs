// Run with `npm test`. The settings cache behind the public pages, and the address fill's fast path.
import { test } from "node:test";
import assert from "node:assert";

const { memo, forget } = await import("../lib/memo.ts");
const { fillAddress } = await import("../lib/hours.ts");

test("memo shares one read, forget drops it, and a failure is not remembered", async () => {
  let n = 0;
  const read = () => memo("k", 60_000, async () => ++n);
  assert.deepEqual(await Promise.all([read(), read()]), [1, 1]);
  forget("k");
  assert.equal(await read(), 2);
  await assert.rejects(memo("bad", 60_000, async () => { throw new Error("x"); }));
  assert.equal(await memo("bad", 60_000, async () => "ok"), "ok");
});

test("fillAddress fills tokens, and returns pages without tokens untouched", () => {
  const plain = { a: ["x"] };
  assert.equal(fillAddress(plain, "1 Main St, Town"), plain);
  assert.deepEqual(fillAddress({ a: ["{street}", "{addressQ}"] }, "1 Main St, Town"), { a: ["1 Main St", "1%20Main%20St%2C%20Town"] });
});
