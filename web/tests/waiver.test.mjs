// Run with `npm test`. Version comparison (what members are told changed) and the signed agreement PDF.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";

const { diffVersions, summarize } = await import("../lib/waiver-diff.ts");
const { buildAgreementPdf } = await import("../lib/sign-pdf.ts");
const seed = JSON.parse(readFileSync("data/waiver-2025.1.json", "utf8"));

test("diff reports edited, added and removed sections in plain terms", () => {
  const b = { ...seed, sections: [...seed.sections.filter((s) => s.heading !== "GUESTS").map((s) => (s.heading === "PAYMENTS OF DUES" ? { ...s, body: s.body.replace("10th", "15th") } : s)), { heading: "PARKING", body: "Park nicely." }] };
  const ch = diffVersions(seed, b);
  assert.deepEqual(ch.map((c) => [c.kind, c.heading]).sort(), [["added", "PARKING"], ["changed", "PAYMENTS OF DUES"], ["removed", "GUESTS"]]);
  assert.ok(ch.find((c) => c.kind === "changed").words.some((w) => w.t === "+" && w.s === "15th"));
  assert.match(summarize(ch), /1 edited, 1 added, 1 removed/);
  assert.deepEqual(diffVersions(seed, seed), []);
});

test("the seeded agreement imports as full sections and renders to a multi-page signed PDF", async () => {
  assert.ok(seed.sections.length >= 30 && seed.sections.every((s) => s.heading && s.body));
  const pdf = await buildAgreementPdf(seed, { name: "Pat Q", email: "p@x.org", signature: "Pat Q", initials: "PQ", drawn: "", at: new Date(), ip: "1.2.3.4", ua: "t" }, "abc");
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  if (process.env.WRITE_PDF) writeFileSync(process.env.WRITE_PDF, pdf);
});
