import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { shareByToken, unlockValue } from "@/lib/library/shares";
import Viewer from "../../members/waiver/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared document | Kzoo Makers", robots: { index: false, follow: false } }; // never a preview card or search result

// A share link: passcode form first, then the document. Unknown, revoked and expired links are all a plain 404.
export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ bad?: string }> }) {
  const { token } = await params, s = await shareByToken(token);
  if (!s) notFound();
  const ok = (await cookies()).get("ls_" + s.id)?.value === unlockValue(s);
  if (!ok) {
    const bad = (await searchParams).bad === "1";
    return (
      <main style={{ maxWidth: 420, margin: "10vh auto", padding: 16 }}>
        <h1>Shared document</h1>
        <p>Enter the passcode you were given to open this document.</p>
        {bad && <p role="alert">That passcode didn't match.</p>}
        <form method="post" action={`/api/library/share/${token}`}>
          <input name="passcode" type="password" aria-label="Passcode" autoComplete="off" required autoFocus /> <button>Open</button>
        </form>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 900, margin: "4vh auto", padding: 16 }}>
      <h1>{s.title}</h1>
      <p className="sub">{s.pages} page{s.pages === 1 ? "" : "s"} · link expires {new Date(s.expires_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
      {s.allow_download && <p><a href={`/api/library/share/${token}/file?download=1`}>Download PDF</a></p>}
      <Viewer src={`/api/library/share/${token}/file`} open />
    </main>
  );
}
