import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { cleanTags, isPdf, safeName, slugify, titleFromFilename, visibleSql } from "../lib/library/rules.ts";
import { extractPdf } from "../lib/library/extract.ts";

test("slugs, titles, tags and filenames are cleaned", () => {
  assert.equal(slugify("Table Saw — Manual (2024)!"), "table-saw-manual-2024");
  assert.equal(slugify("???"), "document");
  assert.equal(titleFromFilename("table_saw  manual.PDF"), "table saw manual");
  assert.deepEqual(cleanTags([" PPE ", "ppe", "PPE", "", "lock  out"]), ["PPE", "ppe", "lock out"]);
  assert.equal(safeName('a"b\r\n.pdf'), "a_b_.pdf");
});

test("only real PDFs pass the magic-byte check", () => {
  assert.equal(isPdf(Buffer.from("%PDF-1.7\n....")), true);
  assert.equal(isPdf(Buffer.from("<html>%PDF-1.7")), false);
  assert.equal(isPdf(Buffer.from("%PDF")), false);
});

test("tier SQL: signed-out sees public only, members add members + authorized, staff see everything not deleted", () => {
  const out = visibleSql({ id: null, member: false, staff: false }, "$1");
  assert.match(out, /status = 'published'/); assert.match(out, /tier = 'public'/); assert.doesNotMatch(out, /members|authorized|staff/);
  const mem = visibleSql({ id: 5, member: true, staff: false }, "$1");
  assert.match(mem, /tier = 'members'/); assert.match(mem, /tier = 'authorized'/); assert.match(mem, /ta\.user_id = \$1/); assert.doesNotMatch(mem, /tier = 'staff'/);
  assert.equal(visibleSql({ id: 5, member: true, staff: true }, "$1"), "d.deleted_at IS NULL");
  assert.doesNotMatch(visibleSql({ id: null, member: true, staff: false }, "$1"), /members/, "a member flag without an id is treated as signed out");
});

test("the PDF reader returns page count and text, and rejects junk", async () => {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Lockout procedure for the table saw", { x: 20, y: 700, font });
  pdf.addPage();
  const r = await extractPdf(Buffer.from(await pdf.save()));
  assert.equal(r.pages, 2); assert.match(r.text, /Lockout procedure/); assert.ok(r.thumb.length > 100, "page-1 thumbnail");
  await assert.rejects(extractPdf(Buffer.from("%PDF-1.4 not really")));
});

test("browsing a folder includes its sub-folders", async () => {
  const { withDescendants } = await import("../lib/library/folders.ts");
  const fs = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 2 }, { id: 4, parent_id: null }];
  assert.deepEqual(withDescendants(fs, 1), [1, 2, 3]);
  assert.deepEqual(withDescendants(fs, 4), [4]);
});

test("share links stop at once when revoked or expired", async () => {
  const { shareLive, SHARE_DAYS, DEFAULT_SHARE_DAYS } = await import("../lib/library/rules.ts");
  const now = new Date("2026-01-10"), day = 86400_000;
  assert.equal(shareLive({ revoked_at: null, expires_at: new Date(+now + day) }, now), true);
  assert.equal(shareLive({ revoked_at: null, expires_at: new Date(+now - 1) }, now), false);
  assert.equal(shareLive({ revoked_at: new Date(+now - 1), expires_at: new Date(+now + day) }, now), false);
  assert.deepEqual([...SHARE_DAYS], [1, 7, 30]); assert.equal(DEFAULT_SHARE_DAYS, 30);
});

test("share tokens: only 32 hex chars are looked up, and the unlock cookie depends on the secret passcode hash", async () => {
  const { unlockValue, shareByToken } = await import("../lib/library/shares.ts");
  assert.equal(await shareByToken("../../etc/passwd"), null);
  assert.equal(await shareByToken("A".repeat(32)), null);
  const a = unlockValue({ token_hash: "t", passcode_hash: "p1" }), b = unlockValue({ token_hash: "t", passcode_hash: "p2" });
  assert.notEqual(a, b); assert.equal(a, unlockValue({ token_hash: "t", passcode_hash: "p1" }));
});

test("only SOPs and safety guides are acknowledged; review dates are overdue the day after", async () => {
  const { needsAck, reviewOverdue } = await import("../lib/library/rules.ts");
  assert.deepEqual(["sop", "safety", "manual", "form"].map(needsAck), [true, true, false, false]);
  assert.equal(reviewOverdue("2026-01-09", "2026-01-10"), true);
  assert.equal(reviewOverdue("2026-01-10", "2026-01-10"), false);
  assert.equal(reviewOverdue(null, "2026-01-10"), false);
});
