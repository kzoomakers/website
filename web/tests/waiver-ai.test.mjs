// Run with `npm test`. What the AI is shown when asked to explain agreement changes.
import { test } from "node:test";
import assert from "node:assert";

const { diffVersions, changesPrompt } = await import("../lib/waiver-diff.ts");
const v = (sections, closing = "I agree.") => ({ sections, closing });

test("prompt shows before/after for edits and whole text for new and removed sections", () => {
  const ch = diffVersions(
    v([{ heading: "Dues", body: "Pay by the 10th." }, { heading: "Guests", body: "No guests." }]),
    v([{ heading: "Dues", body: "Pay by the 15th." }, { heading: "Fees", body: "Classes cost extra." }]));
  const p = changesPrompt(ch);
  assert.match(p, /EDITED "Dues"\nBEFORE: Pay by the 10th\.\nAFTER: Pay by the 15th\./);
  assert.match(p, /NEW SECTION "Fees": Classes cost extra\./);
  assert.match(p, /REMOVED SECTION "Guests": No guests\./);
});

test("prompt refuses changes too long to send", () => {
  const ch = diffVersions(v([{ heading: "A", body: "x" }]), v([{ heading: "A", body: "x " + "word ".repeat(15000) }]));
  assert.throws(() => changesPrompt(ch), /too long/);
});
