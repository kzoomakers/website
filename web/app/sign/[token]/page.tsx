import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { byToken, markOpened, unlocked } from "@/lib/sign";
import { db } from "@/lib/db";
import Sign from "./sign";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign a document | Kzoo Makers", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public, opened from the emailed link; the token is the credential (plus a password / emailed code when the sender asked for one).
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  if (!db()) notFound();
  const token = (await params).token, f = await byToken(token).catch(() => null);
  if (!f) return <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 16px" }}><h1>Link not valid</h1><p>This signing link is wrong or has been replaced by a newer one. Ask the sender for a fresh link.</p></main>;
  const { doc, signer, fields } = f, gated = signer.locked && !unlocked(signer.id, (await cookies()).get("su" + signer.id)?.value);
  if (!gated && !signer.signed_at) await markOpened(signer.id).catch(() => {});
  return (
    <main style={{ maxWidth: 920, margin: "40px auto", padding: "0 16px", display: "grid", gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>{doc.title}</h1>
      <p className="sub" style={{ margin: 0 }}>For {signer.name} ({signer.email}){doc.due_at ? ` · due ${new Date(doc.due_at).toLocaleDateString()}` : ""}{doc.tags.length ? ` · ${doc.tags.join(", ")}` : ""}</p>
      {!gated && doc.present.length > 0 && <p className="sub" style={{ margin: 0 }}>Present: {doc.present.join(", ")}</p>}
      {!gated && doc.message && <p className="card" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{doc.message}</p>}
      {!gated && !doc.has_pdf && <article style={{ whiteSpace: "pre-wrap", border: "1px solid #ddd", borderRadius: 8, padding: 16, background: "#fff", color: "#111", maxWidth: 720 }}>{doc.body}</article>}
      <Sign token={token} name={signer.name} role={signer.role} fields={doc.has_pdf ? fields : []} pdf={doc.has_pdf} redirect={doc.redirect_url} gate={gated ? { pw: signer.has_pw, code: signer.verify_email } : null}
        state={signer.signed_at ? "signed" : signer.declined_at ? "declined" : doc.status === "open" ? "open" : doc.status} />
      <p className="sub">Encrypted in transit and stored encrypted at rest.</p>
    </main>
  );
}
