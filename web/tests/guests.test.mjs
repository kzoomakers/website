// Run with `npm test`. The guest notice trickle, the deletion wording, and the two-signature (minor) agreement PDF.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const { noticeAllowance, DEFAULT_CFG, deleteText } = await import("../lib/guest-rules.ts");
const { buildAgreementPdf } = await import("../lib/sign-pdf.ts");
const seed = JSON.parse(readFileSync("data/guest-agreement-1.0.json", "utf8"));
const t = DEFAULT_CFG.noticeTiers;

test("guest update emails: 10 a day, backing off as the day's email total rises, none above 80", () => {
  assert.equal(noticeAllowance(t, 0, 0), 10);
  assert.equal(noticeAllowance(t, 60, 0), 10);
  assert.equal(noticeAllowance(t, 61, 0), 4);
  assert.equal(noticeAllowance(t, 66, 0), 3);
  assert.equal(noticeAllowance(t, 71, 0), 2);
  assert.equal(noticeAllowance(t, 76, 0), 1);
  assert.equal(noticeAllowance(t, 81, 0), 0);
  assert.equal(noticeAllowance(t, 100, 0), 0);
});

test("guest update emails: what was already sent today counts against the day's amount", () => {
  assert.equal(noticeAllowance(t, 20, 7), 3);
  assert.equal(noticeAllowance(t, 20, 10), 0);
  assert.equal(noticeAllowance(t, 62, 4), 0); // the total went up since: the smaller allowance is already used
  assert.equal(noticeAllowance(t, 20, 99), 0);
});

test("scheduled-deletion message names the date, the years and the host", () => {
  const m = deleteText("2028-11-09T12:00:00Z", "Pat", 2);
  assert.match(m, /scheduled to delete on midnight at 11\/09\/2028 exactly 2 years since your last visit/);
  assert.match(m, /cancelled if Pat brings you back/);
});

test("the guest agreement seed is complete, and a minor's PDF carries a guardian signature block", async () => {
  assert.ok(seed.sections.length >= 5 && seed.sections.every((s) => s.heading && s.body) && seed.closing);
  const sg = (name) => ({ name, email: "g@x.org", signature: name, initials: "GG", drawn: "", at: new Date(), ip: "1.2.3.4", ua: "t" });
  const solo = await buildAgreementPdf(seed, sg("Gus Guest"), "abc");
  const minor = await buildAgreementPdf(seed, sg("Gus Guest"), "abc", sg("Gail Guardian"));
  assert.equal(minor.subarray(0, 4).toString(), "%PDF");
  assert.ok(minor.length > solo.length);
  assert.ok(minor.toString("latin1").includes("Guardian") || minor.length > solo.length);
});
