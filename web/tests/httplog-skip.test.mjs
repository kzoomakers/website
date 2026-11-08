// Run with `npm test`. Requests from internal addresses are not written to the HTTP log.
import { test } from "node:test";
import assert from "node:assert";
const { skipped } = await import("../lib/httplog-skip.ts");

test("the two internal addresses are skipped, mapped or plain; others are logged", () => {
  assert.ok(skipped("::ffff:172.19.19.81") && skipped("::ffff:172.19.31.1") && skipped("172.19.31.1"));
  assert.ok(!skipped("::ffff:172.19.19.82") && !skipped("8.8.8.8") && !skipped(""));
});
