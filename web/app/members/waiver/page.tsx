import MembersShell from "../shell";
import Viewer from "./viewer";
import "./waiver.css";
import { accountView } from "@/lib/waiver";
import { summarize, type Change } from "@/lib/waiver-diff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liability Waiver | Kzoo Makers", robots: { index: false } };

const day = (s: string) => new Date(s).toLocaleDateString([], { dateStyle: "long" });

// Git-style: each edited section shows its old text on a red "-" line and its new text on a green "+" line, with the exact words marked.
function Diff({ c }: { c: Change }) {
  const row = (sign: "+" | "-", body: React.ReactNode) => <div className={`wv-l ${sign === "+" ? "add" : "del"}`}><span className="wv-g">{sign}</span><p>{body}</p></div>;
  return (
    <div className="wv-sec">
      <div className="wv-h"><span className={`wv-b ${c.kind}`}>{c.kind === "changed" ? "Edited" : c.kind === "added" ? "Added" : "Removed"}</span>{c.heading}</div>
      {c.words ? (
        <>
          {row("-", c.words.filter((w) => w.t !== "+").map((w, i) => (w.t === "-" ? <mark key={i}>{w.s}</mark> : w.s)))}
          {row("+", c.words.filter((w) => w.t !== "-").map((w, i) => (w.t === "+" ? <mark key={i}>{w.s}</mark> : w.s)))}
        </>
      ) : row(c.kind === "added" ? "+" : "-", c.body)}
    </div>
  );
}

export default function WaiverPage() {
  return (
    <MembersShell title="Liability Waiver" path="/members/waiver">
      {async (u) => {
        const v = await accountView(u.id);
        if (!v) return <p>You haven't signed a waiver yet.</p>;
        const last = v.items[0];
        return (
          <div className="wv-book"><div className="wv">
            <div className={`wv-hero ${v.current ? "ok" : "new"}`}>
              <div><div className="wv-k">Last signed</div><div className="wv-big">{day(last.signed_at)}</div></div>
              <div><div className="wv-k">Your revision</div><div className="wv-big">{last.version.revision}</div></div>
              <div className="wv-pill">{v.current ? "✓ Up to date" : <>Revision {v.latest} is waiting · <a href="/members">review and sign</a></>}</div>
            </div>
            <h2>Every revision you've signed</h2>
            <ol className="wv-tl">
              {v.items.map((s, i) => (
                <li key={s.doc_id}>
                  <details open={i === 0}>
                    <summary><strong>Revision {s.version.revision}</strong><span>signed {day(s.signed_at)}</span>{i === 0 && <em>latest</em>}</summary>
                    <div className="wv-in">
                      <Viewer src={`/api/account/waiver?doc=${s.doc_id}&inline=1`} open={i === 0} />
                      <a className="wv-dl" href={`/api/account/waiver?doc=${s.doc_id}`}>Download PDF</a>
                      {s.prevRevision ? (
                        <>
                          <h3>What changed from revision {s.prevRevision}</h3>
                          {s.notes.map((n) => n.summary && <p key={n.revision} className="wv-note">{n.summary}</p>)}
                          <p className="wv-sum">{summarize(s.changes)}</p>
                          <div className="wv-diff">{s.changes.length ? s.changes.map((c) => <Diff key={c.kind + c.heading} c={c} />) : <p className="wv-sum">The wording is identical.</p>}</div>
                        </>
                      ) : <p className="wv-sum">This was the first agreement you signed.</p>}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </div></div>
        );
      }}
    </MembersShell>
  );
}
