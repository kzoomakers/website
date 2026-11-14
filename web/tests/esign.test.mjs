// Run with `npm test`. Uploaded-PDF field rendering, the digital (PAdES) seal, and the signer unlock cookie.
import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, PDFName } from "pdf-lib";

process.env.PII_CRYPTO_SECRET = "test-secret";
process.env.CONFIG_PATH = "/nonexistent/config.json"; // never pick up a developer's real database
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

test("generated certificates always have a positive serial number", async () => {
  const { newCert } = await import("../lib/pdf-seal.ts");
  for (let i = 0; i < 20; i++) { // the old code was negative about half the time
    const serial = execFileSync("openssl", ["x509", "-inform", "DER", "-noout", "-serial"], { input: (await newCert("T")).cert }).toString();
    assert.ok(!serial.includes("-"), serial);
  }
});

test("a generated certificate survives encrypt, store and reload, and then signs a PDF", async () => {
  const { newCert, packKey, buildSigner } = await import("../lib/pdf-seal.ts");
  const { seal, open } = await import("../lib/vault.ts");
  const { PDF } = await import("@libpdf/core");
  const stored = JSON.parse(JSON.stringify(packKey(await newCert("Test Org"), "Test Org", seal))); // as it comes back from the jsonb column
  assert.ok(!JSON.stringify(stored).includes("PRIVATE")); // the key is not stored in the clear
  const { bytes } = await (await PDF.load(src)).sign({ signer: await buildSigner(stored, open), reason: "t", subFilter: "ETSI.CAdES.detached" });
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(/\/ByteRange/.test(text) && /ETSI\.CAdES\.detached/.test(text));
  process.env.PII_CRYPTO_SECRET = "a-different-secret"; // a changed secret must fail loudly (shown on the Services page), not sign with garbage
  await assert.rejects(buildSigner(stored, open));
  process.env.PII_CRYPTO_SECRET = "test-secret";
});

test("an uploaded .p12 is checked, its name and expiry read, and it signs after reload", async () => {
  const { packP12, buildSigner } = await import("../lib/pdf-seal.ts");
  const { seal, open } = await import("../lib/vault.ts");
  const { PDF } = await import("@libpdf/core");
  const dir = mkdtempSync(join(tmpdir(), "p12-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "30", "-subj", "/CN=Bought Cert"], { stdio: "ignore" });
  execFileSync("openssl", ["pkcs12", "-export", "-inkey", join(dir, "k.pem"), "-in", join(dir, "c.pem"), "-out", join(dir, "c.p12"), "-passout", "pass:pw"], { stdio: "ignore" });
  const p12 = readFileSync(join(dir, "c.p12"));
  await assert.rejects(packP12(p12, "wrong", seal), /valid \.p12/);
  const stored = JSON.parse(JSON.stringify(await packP12(p12, "pw", seal)));
  assert.equal(stored.name, "Bought Cert");
  assert.ok(Math.abs(new Date(stored.expires) - Date.now() - 30 * 864e5) < 864e5);
  const { bytes } = await (await PDF.load(src)).sign({ signer: await buildSigner(stored, open), reason: "t", subFilter: "ETSI.CAdES.detached" });
  assert.ok(/\/ByteRange/.test(Buffer.from(bytes).toString("latin1")));
});

test("the unlock cookie only works for its own signer and rejects tampering", () => {
  const c = unlockCookie(5);
  assert.ok(unlocked(5, c.value));
  assert.ok(!unlocked(6, c.value) && !unlocked(5, undefined) && !unlocked(5, c.value.replace(/.$/, (ch) => (ch === "0" ? "1" : "0"))) && !unlocked(5, "1." + c.value.split(".")[1]));
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

test("auto-detect reads French, German and Spanish captions, scores sure vs unsure, and finds checkbox glyphs", async () => {
  const { detect } = await import("../lib/pdf-detect.ts");
  const it = (str, x, y, w = 100, h = 10) => ({ str, x, y, w, h });
  const f = detect([{ w: 612, h: 792, annots: [], items: [
    it("Unterschrift", 72, 600, 70), it("Datum:", 72, 500, 40), it("Firma", 72, 400, 40), it("Initiales", 300, 300, 40),
    it("Courriel:", 72, 200, 50), it("____________", 130, 200, 150), it("☐", 72, 100, 10), it("{{signature}}", 300, 600, 80)] }], 0, 0);
  const t = (type) => f.filter((x) => x.type === type);
  assert.equal(t("signature").length, 3); // Unterschrift, Firma, the placeholder
  assert.equal(t("date").length, 1);
  assert.equal(t("initials").length, 1);
  assert.equal(t("email").length, 1);
  assert.equal(t("checkbox").length, 1);
  assert.equal(f.find((x) => x.type === "email").conf, 0.9); // label + blank line
  assert.ok(f.filter((x) => x.type === "signature").some((x) => x.conf === 1)); // placeholder is certain
  assert.ok(t("date")[0].conf < 0.7); // a bare caption is a guess
});

test("field prefs: cleaned, read-only needs a value, and aligned numbers still stamp", async () => {
  const { cleanSetup } = await import("../lib/sign.ts");
  const sig = { r: 0, type: "signature", page: 1, x: 1, y: 1, w: 20, h: 5 };
  const k = cleanSetup({ signers: [{ name: "A", email: "a@x.org" }], fields: [sig,
    { r: 0, type: "number", page: 1, x: 1, y: 20, w: 10, h: 3, prefs: { def: "42", ro: true, align: "r", size: 99 } },
    { r: 0, type: "text", page: 1, x: 1, y: 30, w: 10, h: 3, prefs: { ro: true, align: "x" } }] }, 1, false);
  assert.deepEqual(k.fields[1].prefs, { def: "42", ro: true, align: "r", size: 24 });
  assert.deepEqual(k.fields[2].prefs, {}); // read-only with nothing to show is dropped
  const pdf = await buildFieldPdf(src, [{ page: 1, x: 10, y: 10, w: 20, h: 3, type: "number", value: "1234", signer: 1, prefs: { align: "r", size: 9 } }], who, { title: "T", completed: new Date(), hideAudit: true }, "h");
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
});

test("conditions and shared answers: cleaned, evaluated, and cells/image/Unicode text stamp without error", async () => {
  const { cleanSetup, shown } = await import("../lib/sign.ts");
  const k = cleanSetup({ signers: [{ name: "A", email: "a@x.org" }], fields: [{ r: 0, type: "signature", page: 1, x: 1, y: 1, w: 20, h: 5 },
    { r: 0, type: "cells", page: 1, x: 1, y: 20, w: 30, h: 3, prefs: { key: "ssn", cells: 9, cond: { key: "us", op: "eq", val: "yes" } } }] }, 1, false);
  assert.deepEqual(k.fields[1].prefs, { key: "ssn", cond: { key: "us", op: "eq", val: "yes" }, cells: 9 });
  assert.equal(shown(k.fields[1], { us: "yes" }), true);
  assert.equal(shown(k.fields[1], { us: "no" }), false);
  assert.equal(shown({ prefs: { cond: { key: "c", op: "filled" } } }, { c: "false" }), false); // an unticked box isn't "filled"
  assert.equal(shown({}, {}), true);
  const png = "data:image/png;base64," + Buffer.from((await (async () => { const d = await PDFDocument.create(); return d.save(); })())).toString("base64").slice(0, 4); // junk image must not break the PDF
  const out = await buildFieldPdf(src, [
    { page: 1, x: 10, y: 10, w: 30, h: 3, type: "cells", value: "123456789", signer: 1, prefs: { cells: 9 } },
    { page: 1, x: 10, y: 20, w: 30, h: 3, type: "text", value: "Žofia Łukasz Ωmega Привет", signer: 1 },
    { page: 1, x: 10, y: 30, w: 20, h: 6, type: "image", value: png, signer: 1 },
    { page: 1, x: 10, y: 40, w: 25, h: 5, type: "signature", value: "", signer: 1, prefs: { stamp: true } }], who, { title: "T", completed: new Date(), hideAudit: true }, "h");
  assert.equal((await PDFDocument.load(out)).getPageCount(), 1);
  const loaded = await PDFDocument.load(out), fonts = loaded.getPage(0).node.Resources().lookup(PDFName.of("Font"));
  assert.ok(fonts.entries().some(([, v]) => String(loaded.context.lookup(v).get(PDFName.of("BaseFont"))).includes("LiberationSans"))); // the Unicode font was embedded, not "?"
});
