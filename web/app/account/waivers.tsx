import { Agreement, Changes } from "@/components/agreement";
import { summarize } from "@/lib/waiver-diff";
import { accountView } from "@/lib/waiver";

const day = (s: string) => new Date(s).toLocaleDateString([], { dateStyle: "long" });

/** "Membership agreement" on the Account page: every version this person signed, what changed between them, and their signed PDFs. */
export default async function Waivers({ userId }: { userId: number }) {
  const v = await accountView(userId);
  if (!v) return null;
  return (
    <section id="agreement" aria-labelledby="waiver-h" style={{ marginTop: 32, display: "grid", gap: 12, maxWidth: 760 }}>
      <h2 id="waiver-h" style={{ marginBottom: 0 }}>Membership agreement</h2>
      <p role="status" className="card" style={{ margin: 0, borderLeft: `4px solid ${v.current ? "#1b7f3b" : "#d6a21f"}` }}>
        <span className="tag pri">{v.current ? "Up to date" : "New revision to sign"}</span> {v.current ? <>You're on the current agreement (revision {v.latest}).</> : <>Revision {v.latest} is available and you'll be asked to sign it. <a href="/members">Review and sign</a></>} Every version you've signed is kept below.
      </p>
      {v.items.map((s, i) => (
        <details key={s.doc_id} className="card" open={i === 0}>
          <summary style={{ cursor: "pointer" }}><strong>Revision {s.version.revision}</strong> · signed {day(s.signed_at)} {i === 0 && <span className="tag">latest you signed</span>}</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <p style={{ margin: 0 }}><a className="pri" href={`/api/account/waiver?doc=${s.doc_id}`}>Download my signed PDF</a></p>
            {s.prevRevision ? (
              <div>
                <strong>What changed from revision {s.prevRevision}</strong>
                {s.notes.map((n) => <p key={n.revision} style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{n.summary}</p>)}
                <p className="sub" style={{ margin: "4px 0 8px" }}>{summarize(s.changes)}</p>
                <details><summary style={{ cursor: "pointer" }}>See every change, word for word</summary><div style={{ marginTop: 8 }}><Changes changes={s.changes} /></div></details>
              </div>
            ) : <p className="sub" style={{ margin: 0 }}>This was the first agreement you signed.</p>}
            <details><summary style={{ cursor: "pointer" }}>Read the full text you signed</summary><div style={{ marginTop: 8 }}><Agreement sections={s.version.sections} closing={s.version.closing} /></div></details>
          </div>
        </details>
      ))}
    </section>
  );
}
