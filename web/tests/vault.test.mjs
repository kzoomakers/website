// Run with `npm test`. Encrypted files must round-trip, never contain the plaintext, and fail closed when tampered with.
import { test } from "node:test";
import assert from "node:assert";

process.env.PII_CRYPTO_SECRET = "test-secret";
const { seal, open } = await import("../lib/vault.ts");

test("vault round-trips and rejects tampering", () => {
  const data = Buffer.from("PHOTO-ID-BYTES-1234567890");
  const blob = seal(data);
  assert.ok(!blob.includes(data));
  assert.deepEqual(open(blob), data);
  blob[blob.length - 1] ^= 1;
  assert.throws(() => open(blob));
});

test("signed PDF builds with long text, odd characters and a signature", async () => {
  const { buildPdf } = await import("../lib/sign-pdf.ts");
  const pdf = await buildPdf({ title: "Resolution “1”", body: "Line “quoted” — ok ✓\n" + "word ".repeat(2000), tags: ["a"], present: ["Pat"], completed: new Date() },
    [{ name: "Pat", email: "p@x.org", signature: "Pat Q", drawn: "", at: new Date(), ip: "1.2.3.4", ua: "test" }], "Resolutions", "abc");
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

test("config secrets: sealed text round-trips, legacy plaintext still reads", async () => {
  const { sealText, openText } = await import("../lib/vault.ts");
  const s = sealText("api-key-123");
  assert.ok(s.startsWith("enc:") && !s.includes("api-key-123"));
  assert.equal(openText(s), "api-key-123");
  assert.equal(openText("old-plain"), "old-plain");
  assert.equal(sealText(""), "");
});
