// Run with `npm test`. Uploaded-PDF field rendering, the digital (PAdES) seal, and the signer unlock cookie.
import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

process.env.PII_CRYPTO_SECRET = "test-secret";
const { buildFieldPdf } = await import("../lib/sign-pdf.ts");
const { sealPdf } = await import("../lib/pdf-seal.ts");
const { unlockCookie, unlocked } = await import("../lib/sign-access.ts");

const src = await (async () => { const d = await PDFDocument.create(); d.addPage([612, 792]); return Buffer.from(await d.save()); })();
const who = new Map([[1, { name: "Ann Lee", email: "a@x.org", signature: "Ann Lee", drawn: "", initials: "AL", at: new Date(), ip: "1.1.1.1", ua: "t" }]]);
const fields = [{ page: 1, x: 10, y: 80, w: 25, h: 5, type: "signature", value: "", signer: 1 }, { page: 1, x: 10, y: 10, w: 25, h: 3, type: "text", value: "hello", signer: 1 }, { page: 1, x: 50, y: 10, w: 3, h: 2.4, type: "checkbox", value: "true", signer: 1 }];

test("fields are drawn on the uploaded PDF and the audit page can be left off", async () => {
  const withAudit = await PDFDocument.load(await buildFieldPdf(src, fields, who, { title: "T", completed: new Date(), hideAudit: false }, "h"));
  const without = await PDFDocument.load(await buildFieldPdf(src, fields, who, { title: "T", completed: new Date(), hideAudit: true }, "h"));
  assert.equal(withAudit.getPageCount(), 2);
  assert.equal(without.getPageCount(), 1);
});

test("the finished PDF gets a cryptographic signature when a certificate is configured", async () => {
  const dir = mkdtempSync(join(tmpdir(), "p12-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "2", "-subj", "/CN=Test"], { stdio: "ignore" });
  execFileSync("openssl", ["pkcs12", "-export", "-inkey", join(dir, "k.pem"), "-in", join(dir, "c.pem"), "-out", join(dir, "c.p12"), "-passout", "pass:pw"], { stdio: "ignore" });
  assert.equal(await sealPdf(src), src); // no certificate: untouched
  process.env.SIGN_P12_FILE = join(dir, "c.p12"); process.env.SIGN_P12_PASSPHRASE = "pw";
  const out = await sealPdf(src), text = out.toString("latin1");
  assert.ok(out.length > src.length && /\/ByteRange/.test(text) && /ETSI\.CAdES\.detached/.test(text));
  assert.ok(readFileSync(join(dir, "c.p12")).length > 0);
});

test("the unlock cookie only works for its own signer and rejects tampering", () => {
  const c = unlockCookie(5);
  assert.ok(unlocked(5, c.value));
  assert.ok(!unlocked(6, c.value) && !unlocked(5, undefined) && !unlocked(5, c.value.replace(/.$/, "0")) && !unlocked(5, "1." + c.value.split(".")[1]));
});

test("auto-detect finds blank lines, captions, placeholders and form fields, but not words inside sentences", async () => {
  const { detect } = await import("../lib/pdf-detect.ts");
  const it = (str, x, y, w = 100, h = 10) => ({ str, x, y, w, h });
  const f = detect([{ w: 612, h: 792, annots: [{ kind: "text", name: "Phone", options: [], rect: [50, 100, 200, 116] }], items: [
    it("Email:", 72, 600, 40), it("____________", 120, 600, 150), it("Please provide their signature:", 72, 500, 200),
    it("Signature of Member", 72, 400, 120), it("{{initials, r2}}", 300, 300, 80), it("Place your initials here", 72, 55, 120)] }], 0, 1);
  const kinds = f.map((x) => x.type + (x.r ? "@r2" : "")).sort();
  assert.deepEqual(kinds, ["email", "initials", "initials@r2", "signature", "text"].sort());
  assert.ok(f.every((x) => x.x >= 0 && x.y >= 0 && x.x + x.w <= 100.001 && x.y + x.h <= 100.001));
});
