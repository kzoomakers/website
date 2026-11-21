"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import PiiButton from "@/components/pii-retrieve";
import JsonDownload from "@/components/pii-json";
import { Rich } from "@/components/training/question";
import { training } from "../../rpc";

const STATE: Record<string, string> = { passed: "Passed, waiting for a trainer", in_training: "In training", ready: "Ready for sign-off", certified: "Certified", rejected: "Sent back", lapsed: "Lapsed", revoked: "Revoked", waived: "Waived" };

const STEPS: [string, string][] = [["passed", "Passed the test"], ["in_training", "Hands-on training"], ["ready", "Ready for sign-off"], ["certified", "Signed off"]];
/** Where this person is, who may move them on, and the one next thing to do. */
function NextStep({ d }: { d: any }) {
  const c = d.cert, at = STEPS.findIndex(([k]) => k === c.state), none = !d.trainers.length;
  const todo = !d.signedIn ? "Your administrator login isn't linked to a member account, so a sign-off couldn't be recorded under your name. Sign in with your member account to act on this."
    : d.self ? "This is your own test, so you can't sign yourself off. Another trainer, or an administrator who isn't you, has to pick it up."
    : !d.can ? "You can look but not act: only a trainer for this tool or an administrator can move this on."
    : c.state === "passed" ? "Next: meet with them, then press Start training. That tells them (and other trainers) you've picked this up."
    : c.state === "in_training" ? "Next: when they're ready, press Mark ready, or press Sign off if you've already seen enough."
    : c.state === "ready" ? "Next: press Sign off and note what you did with them. That gives them the authorization." : "";
  if (at < 0) return null;
  return (
    <div className="card">
      <p style={{ margin: 0 }}>{STEPS.map(([k, l], i) => <span key={k} className="tag" style={i === at ? { fontWeight: 700 } : i < at ? { opacity: 0.6 } : { opacity: 0.4 }}>{i < at ? "✓ " : `${i + 1}. `}{l}</span>)}</p>
      {todo && <p style={{ margin: "8px 0 0" }}>{todo}</p>}
      {none && c.state !== "certified" && <p role="alert" style={{ margin: "8px 0 0" }}>No trainer is assigned to {c.tool}, so only administrators can sign this off. <Link href="/admin/people/training/trainers">Assign trainers</Link>{d.self ? "" : ", or sign off yourself if you're an administrator."}</p>}
      {!none && <p className="sub" style={{ margin: "8px 0 0" }}>Trainers for {c.tool}: {d.trainers.join(", ")}.</p>}
    </div>
  );
}
const TIMES = [["1", "None"], ["1.25", "×1.25"], ["1.5", "×1.5"], ["2", "×2"]];
/** Extra time and read-aloud for this member, for every test they take. Copied onto each attempt when it starts. */
function Accommodation({ userId, value, onSaved }: { userId: number; value: any; onSaved: () => void }) {
  const [m, setM] = useState(String(value.time_multiplier)), [ra, setRa] = useState(!!value.read_aloud), [notes, setNotes] = useState("");
  const save = () => training("setAccommodation", { user: userId, settings: { time_multiplier: Number(m), read_aloud: ra, notes } }).then(onSaved, (e) => alertDialog(e.message));
  return (
    <div className="card">
      <label>Extra time <select value={m} onChange={(e) => setM(e.target.value)}>{TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>{" "}
      <label><input type="checkbox" checked={ra} onChange={(e) => setRa(e.target.checked)} /> Read-aloud tools allowed</label>
      <textarea aria-label="Accommodation notes" rows={2} style={{ width: "100%" }} placeholder={value.has_notes ? "A note is on file. Type here to replace it." : "Why, and anything the test should know"} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="bar"><button onClick={save}>Save accommodation</button></div>
      {value.set_by && <p className="sub">Last set by {value.set_by}{value.set_at ? `, ${new Date(value.set_at).toLocaleDateString()}` : ""}. Applies to tests started from now on. Notes are private: staff with personal-information access read them under the member's Training record.</p>}
    </div>
  );
}

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
      <NextStep d={d} />
      {open && d.can && (
        <div className="bar">
          {c.state === "passed" && <button className="pri" onClick={() => run("startTraining")}>Start training</button>}
          {c.state === "in_training" && <button onClick={() => run("markReady")}>Mark ready</button>}
          <button className="pri" onClick={sign}>Sign off…</button>
          <button onClick={no}>Needs more…</button>
        </div>
      )}
      {d.signoffs.length > 0 && <p className="sub">Signed off by {d.signoffs.map((s: any) => s.name).join(", ")} ({d.signoffs.length} of {c.signoffs_required}).</p>}
      {d.can && <><h2>Accommodations</h2><Accommodation key={JSON.stringify(d.accommodation)} userId={c.user_id} value={d.accommodation} onSaved={load} /></>}
      <h2>Their test</h2>
      {c.attempt_id && <p><PiiButton kind="training_attempt" label="Evidence for this attempt" subject={{ type: "member", id: c.user_id, attempt: c.attempt_id }}>{(ev) => <JsonDownload data={ev} name={`attempt-${c.attempt_id}.json`} label="Download evidence (JSON)" />}</PiiButton></p>}
      <div className="card">{!d.questions.length ? <p className="sub">No stored answers.</p> : d.questions.map((q: any) => (
        <div className="row" key={q.id} style={{ display: "block" }}>
          <span className="tag" style={{ color: q.correct ? "#1b7a3a" : "#b00020" }}>{q.correct ? "Right" : "Missed"}</span>{q.critical && <span className="tag">Critical</span>} <span className="tag">{q.points}/{q.max}</span>
          <Rich html={q.prompt_html} />
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
