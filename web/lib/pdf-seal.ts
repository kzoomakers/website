import { readFileSync } from "fs";
import type { Signer } from "@libpdf/core";

// Cryptographic (PAdES / CAdES-detached) signature over the finished PDF, using a .p12 certificate (same engine Documenso uses). Adobe and other readers validate it and flag any later edit.
// Set SIGN_P12_FILE (path) or SIGN_P12_BASE64, plus SIGN_P12_PASSPHRASE. Without a certificate the PDF is still built, hashed and encrypted, just not digitally signed.
// shortcut: no RFC 3161 timestamp / long-term validation; add `timestampAuthority` to pdf.sign when a TSA is chosen.
export const sealConfigured = () => !!(process.env.SIGN_P12_BASE64 || process.env.SIGN_P12_FILE);
let signer: Promise<Signer> | null = null;
const getSigner = () => (signer ??= import("@libpdf/core").then(({ P12Signer }) =>
  P12Signer.create(process.env.SIGN_P12_BASE64 ? Buffer.from(process.env.SIGN_P12_BASE64, "base64") : readFileSync(process.env.SIGN_P12_FILE!), process.env.SIGN_P12_PASSPHRASE ?? "", { buildChain: false })).catch((e) => { signer = null; throw e; }));

export async function sealPdf(pdf: Buffer): Promise<Buffer> {
  if (!sealConfigured()) return pdf;
  try {
    const { PDF } = await import("@libpdf/core");
    const { bytes } = await (await PDF.load(pdf)).sign({ signer: await getSigner(), reason: "Signed electronically", subFilter: "ETSI.CAdES.detached" });
    return Buffer.from(bytes);
  } catch (e) { console.error("digital signature failed, storing the unsealed PDF:", e); return pdf; }
}
