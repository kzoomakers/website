import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "crypto";

// Encryption at rest for photo IDs and signed PDFs. AES-256-GCM; the key is derived from PII_CRYPTO_SECRET (separate from the login-cookie secret).
// shortcut: rotating PII_CRYPTO_SECRET makes stored files unreadable; add a key-id prefix and a re-encrypt job before ever rotating it.
const key = () => {
  const s = process.env.PII_CRYPTO_SECRET;
  if (!s) throw new Error("PII_CRYPTO_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", s, "kzoomakers", "vault-v1", 32));
};

/** iv(12) | tag(16) | ciphertext */
export function seal(data: Buffer): Buffer {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv), ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function open(blob: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key(), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
