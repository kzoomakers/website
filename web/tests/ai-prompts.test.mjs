// Run with `npm test`. The price limit and prompt/output rules for the AI features.
import { test } from "node:test";
import assert from "node:assert";

const { isCheap, promptOverride, tidyOutput, MAX_PROMPT } = await import("../lib/ai-prompts.ts");

test("price limit: free and 0.06 pass, 0.0601, unknown and pricey output fail", () => {
  assert.ok(isCheap({ price: 0 }));
  assert.ok(isCheap({ price: 0.06, outPrice: 0.06 }));
  assert.ok(!isCheap({ price: 0.0601 }));
  assert.ok(!isCheap({}));
  assert.ok(!isCheap({ price: 0.01, outPrice: 0.5 }));
});

test("a prompt equal to its default is stored blank; too long is refused", () => {
  assert.equal(promptOverride("  same ", "same"), "");
  assert.equal(promptOverride("mine", "same"), "mine");
  assert.throws(() => promptOverride("x".repeat(MAX_PROMPT + 1), "same"));
});

test("output loses code fences and dashes", () => {
  assert.equal(tidyOutput("```html\n<p>a — b</p>\n```"), "<p>a, b</p>");
  assert.equal(tidyOutput("<p>1–2</p>"), "<p>1, 2</p>");
});
