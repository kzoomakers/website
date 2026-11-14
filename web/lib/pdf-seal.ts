import { readFileSync } from "fs";
import type { Signer } from "@libpdf/core";

// Cryptographic (PAdES / CAdES-detached) signature over the finished PDF (same engine Documenso uses). Adobe and other readers validate it and flag any later edit.
// The certificate lives in the settings table (key "seal"), encrypted with PII_CRYPTO_SECRET; /admin/services can generate one or take an uploaded .p12.
// SIGN_P12_FILE / SIGN_P12_BASE64 + SIGN_P12_PASSPHRASE still work as a fallback. Without any certificate the PDF is still built, hashed and encrypted, just not digitally signed.
// shortcut: no RFC 3161 timestamp / long-term validation; add `timestampAuthority` to pdf.sign when a TSA is chosen.
type Stored = { kind: "key"; key: string; cert: string; name: string; expires: string } | { kind: "p12"; p12: string; pass: string; name: string; expires: string };
const b64 = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64");

// db and vault are imported lazily so this file loads under the plain-node test runner, which cannot resolve extensionless imports.
const vault = () => import("./vault");
const getDb = async () => (await import("./db")).db();
async function stored(): Promise<Stored | null> {
  const d = await getDb().catch(() => null);
  if (!d) return null;
  await d.ready;
  return ((await d.pool.query("SELECT data FROM settings WHERE key='seal'")).rows[0]?.data as Stored | undefined) ?? null;
}
const fromEnv = () => (process.env.SIGN_P12_BASE64 || process.env.SIGN_P12_FILE ? "env" : null);

/** For the admin screen: what is in use (never the key itself), and `broken` when it is stored but cannot sign. */
export async function sealInfo() {
  const s = await stored().catch(() => null);
  if (!s && !fromEnv()) return null;
  const broken = await getSigner().then(() => undefined, (e: Error) => e.message || "unreadable");
  return s ? { source: "db" as const, name: s.name, expires: s.expires, generated: s.kind === "key", broken } : { source: "env" as const, broken };
}
export const sealConfigured = async () => !!(await sealInfo());

/** Turns a stored certificate back into a signer. `open` is vault.open (passed in so tests need no PII secret plumbing or lazy imports). */
export async function buildSigner(s: Stored, open: (b: Buffer) => Buffer): Promise<Signer> {
  const { P12Signer, CryptoKeySigner } = await import("@libpdf/core");
  if (s.kind === "p12") return P12Signer.create(open(unb64(s.p12)), open(unb64(s.pass)).toString(), { buildChain: false });
  const key = await crypto.subtle.importKey("pkcs8", new Uint8Array(open(unb64(s.key))), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return new CryptoKeySigner(key, unb64(s.cert), "RSA", "RSASSA-PKCS1-v1_5");
}

let cached: { id: string; signer: Promise<Signer> } | null = null;
async function getSigner(): Promise<Signer | null> {
  const s = await stored().catch(() => null), id = s ? JSON.stringify(s) : fromEnv() ?? "";
  if (!id) return null;
  if (cached?.id !== id) {
    const signer = s ? vault().then(({ open }) => buildSigner(s, open))
      : import("@libpdf/core").then(({ P12Signer }) => P12Signer.create(process.env.SIGN_P12_BASE64 ? unb64(process.env.SIGN_P12_BASE64) : readFileSync(process.env.SIGN_P12_FILE!), process.env.SIGN_P12_PASSPHRASE ?? "", { buildChain: false }));
    signer.catch(() => { if (cached?.signer === signer) cached = null; });
    cached = { id, signer };
  }
  return cached.signer;
}

export async function sealPdf(pdf: Buffer): Promise<Buffer> {
  try {
    const signer = await getSigner();
    if (!signer) return pdf;
    const { PDF } = await import("@libpdf/core");
    const { bytes } = await (await PDF.load(pdf)).sign({ signer, reason: "Signed electronically", subFilter: "ETSI.CAdES.detached" });
    return Buffer.from(bytes);
  } catch (e) { console.error("digital signature failed, storing the unsealed PDF:", e); return pdf; }
}

const save = async (s: Stored | null) => {
  const d = await getDb();
  if (!d) throw new Error("Postgres isn't configured yet");
  await d.ready;
  if (s) await d.pool.query("INSERT INTO settings (key, data) VALUES ('seal', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(s)]);
  else await d.pool.query("DELETE FROM settings WHERE key='seal'");
};
export const removeSeal = () => save(null);

/** A 10-year self-signed RSA certificate (Adobe shows "unknown signer" but still proves the file wasn't altered). */
export async function newCert(cn: string) {
  const asn1js = await import("asn1js"), pki = await import("pkijs");
  const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const cert = new pki.Certificate(), now = new Date(), end = new Date(now.getTime() + 10 * 365 * 864e5);
  cert.version = 2;
  const serial = crypto.getRandomValues(new Uint8Array(8));
  serial[0] = (serial[0] & 0x7f) || 1; // top bit set would make the DER integer negative (RFC 5280 forbids); a zero first byte is a non-minimal encoding strict OpenSSL rejects (1 in 128)
  cert.serialNumber = new asn1js.Integer({ valueHex: serial.buffer as ArrayBuffer });
  for (const t of [cert.issuer, cert.subject]) t.typesAndValues.push(new pki.AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: cn }) }));
  cert.notBefore.value = now; cert.notAfter.value = end;
  cert.extensions = [new pki.Extension({ extnID: "2.5.29.15", critical: true, extnValue: new asn1js.BitString({ valueHex: new Uint8Array([0x80]).buffer, unusedBits: 7 }).toBER() })]; // keyUsage: digitalSignature
  await cert.subjectPublicKeyInfo.importKey(publicKey);
  await cert.sign(privateKey, "SHA-256");
  return { key: Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)), cert: Buffer.from(cert.toSchema(true).toBER()), expires: end.toISOString() };
}

export const packKey = (c: { key: Buffer; cert: Buffer; expires: string }, name: string, sealIt: (b: Buffer) => Buffer): Stored =>
  ({ kind: "key", key: b64(sealIt(c.key)), cert: b64(c.cert), name, expires: c.expires });

export async function generateSeal(org: string) {
  const name = org.trim().slice(0, 64) || "Signed documents";
  await save(packKey(await newCert(name), name, (await vault()).seal));
}

/** An uploaded .p12 is checked by loading it before it is stored. */
export async function packP12(p12: Buffer, pass: string, sealIt: (b: Buffer) => Buffer): Promise<Stored> {
  const { P12Signer } = await import("@libpdf/core");
  const signer = await P12Signer.create(p12, pass, { buildChain: false }).catch(() => { throw new Error("That file or passphrase isn't a valid .p12 certificate"); });
  const { Certificate } = await import("pkijs"), { fromBER } = await import("asn1js");
  const c = new Certificate({ schema: fromBER(new Uint8Array(signer.certificate).buffer as ArrayBuffer).result });
  return { kind: "p12", p12: b64(sealIt(p12)), pass: b64(sealIt(Buffer.from(pass))), name: c.subject.typesAndValues.find((t) => t.type === "2.5.4.3")?.value.valueBlock.value ?? "Uploaded certificate", expires: c.notAfter.value.toISOString() };
}
export async function uploadSeal(p12: Buffer, pass: string) {
  await save(await packP12(p12, pass, (await vault()).seal));
}
