"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { training } from "../../rpc";

const STATE: Record<string, string> = { passed: "Passed, waiting for a trainer", in_training: "In training", ready: "Ready for sign-off", certified: "Certified", rejected: "Sent back", lapsed: "Lapsed", revoked: "Revoked", waived: "Waived" };

export default function File({ id }: { id: number }) {
  const [d, setD] = useState<any>(null), [note, setNote] = useState(""), [shared, setShared] = useState(false), [session, setSession] = useState(false);
  const load = useCallback(() => training("file", { id }).then(setD, (e) => alertDialog(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="sub">Loading…</p>;
  const { cert: c } = d, open = ["passed", "in_training", "ready"].includes(c.state);
  const run = (op: string, extra: Record<string, unknown> = {}) => training(op, { id, ...extra }).then((r) => { load(); return r; }, (e) => { alertDialog(e.message); return null; });
  const sign = async () => {
    const n = await promptDialog(`Sign off ${c.name} on ${c.tool}? This gives them the authorization${c.signoffs_required > 1 ? ` (it needs ${c.signoffs_required} sign-offs; yours is one)` : ""}. What did you do with them?`, "", { multiline: true, ok: "Sign off" });
    if (n !== null) { const r = await run("signOff", { note: n }); if (r && !r.certified) alertDialog(`Recorded. ${r.have} of ${r.need} sign-offs so far.`); }
  };
  const no = async () => { const n = await promptDialog("Why does this need more work? The member sees this.", "", { multiline: true, ok: "Send back" }); if (n !== null) run("reject", { reason: n }); };
  return (
    <>
      <p><Link href="/admin/people/training">← Queue</Link></p>
      <h1>{c.name}: {c.tool}</h1>
      <p className="sub">{c.email} · {STATE[c.state] ?? c.state}{c.rev_no ? ` · revision ${c.rev_no}` : ""}{d.tries ? ` · ${d.tries} attempt${d.tries === 1 ? "" : "s"}` : ""}{d.attempt ? ` · ${Math.round(d.attempt.pct)}% on ${new Date(d.attempt.submitted_at).toLocaleDateString()}` : ""}</p>
      {d.self && <p className="sub">This is your own training, so someone else has to review it.</p>}
      {open && d.can && (
        <div className="bar">
          {c.state === "passed" && <button className="pri" onClick={() => run("startTraining")}>Start training</button>}
          {c.state === "in_training" && <button onClick={() => run("markReady")}>Mark ready</button>}
          <button className="pri" onClick={sign}>Sign off…</button>
          <button onClick={no}>Needs more…</button>
        </div>
      )}
      {d.signoffs.length > 0 && <p className="sub">Signed off by {d.signoffs.map((s: any) => s.name).join(", ")} ({d.signoffs.length} of {c.signoffs_required}).</p>}
      <h2>Their test</h2>
      <div className="card">{!d.questions.length ? <p className="sub">No stored answers.</p> : d.questions.map((q: any) => (
        <div className="row" key={q.id} style={{ display: "block" }}>
          <span className="tag" style={{ color: q.correct ? "#1b7a3a" : "#b00020" }}>{q.correct ? "Right" : "Missed"}</span>{q.critical && <span className="tag">Critical</span>} <span className="tag">{q.points}/{q.max}</span>
          <div dangerouslySetInnerHTML={{ __html: q.prompt_html }} />
          <div className="sub" style={{ margin: 0 }}>Key: {q.key}</div>
          <div className="sub" style={{ margin: 0 }}>Their answer: <code>{JSON.stringify(q.given)}</code></div>
        </div>
      ))}</div>
      <h2>Notes</h2>
      <div className="card">{!d.events.length ? <p className="sub">Nothing yet.</p> : d.events.map((e: any) => (
        <div className="row" key={e.id} style={{ display: "block" }}><b>{e.kind.replace("_", " ")}</b> <span className="sub" style={{ margin: 0 }}>{e.actor} · {new Date(e.at).toLocaleString()}{e.shared ? " · member can see" : ""}</span><div>{e.note}</div></div>
      ))}</div>
      {open && d.can && (
        <form onSubmit={(e) => { e.preventDefault(); run("note", { note, shared, session }).then((r) => { if (r) setNote(""); }); }}>
          <textarea aria-label="Add a note" rows={3} style={{ width: "100%" }} placeholder="What you did with them, what to work on next" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="bar"><label><input type="checkbox" checked={session} onChange={(e) => setSession(e.target.checked)} /> This was a training session</label><label><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Member can read it</label><button disabled={!note.trim()}>Add note</button></div>
        </form>
      )}
    </>
  );
}
