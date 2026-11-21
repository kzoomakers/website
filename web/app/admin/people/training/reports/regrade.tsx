"use client";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { training } from "../rpc";

// Regrade: fix a wrong answer key without re-testing anyone. Pick the version people took and the corrected one, preview, then apply.
type T = { id: number; title: string; tool: string; archived: boolean };
type Rev = { id: number; rev_no: number; status: string };
type Preview = { from: number; to: number; title: string; promote: number; demote: number; same: number; in_progress: number; changes: { attempt: number; name: string; email: string; kind: "promote" | "demote"; old_pct: number; new_pct: number; old_passed: boolean; new_passed: boolean }[] };
type List = { runs: { id: number; from_rev: number; to_rev: number; applied_by: string; applied_at: string; promoted: number; pending: number; kept: number; revoked: number }[]; pending: { id: number; attempt_id: number; old_pct: number; new_pct: number; name: string; email: string; from_rev: number }[] };

export default function Regrade({ canOverride }: { canOverride: boolean }) {
  const [tests, setTests] = useState<T[]>([]), [test, setTest] = useState<number | "">(""), [revs, setRevs] = useState<Rev[]>([]);
  const [from, setFrom] = useState<number | "">(""), [to, setTo] = useState<number | "">(""), [prev, setPrev] = useState<Preview | null>(null), [list, setList] = useState<List | null>(null);
  useEffect(() => { training<T[]>("tests").then((r) => setTests(r.filter((t) => !t.archived)), (e) => alertDialog(e.message)); }, []);
  const loadList = useCallback((id: number) => training<List>("regradeList", { test: id }).then(setList, (e) => alertDialog(e.message)), []);
  useEffect(() => {
    setFrom(""); setTo(""); setPrev(null); setList(null); setRevs([]);
    if (test === "") return;
    training<{ revisions: Rev[] }>("test", { id: test }).then((t) => setRevs(t.revisions), (e) => alertDialog(e.message));
    loadList(test);
  }, [test, loadList]);
  const ready = from !== "" && to !== "";
  const check = () => training<Preview>("regradePreview", { from, to }).then(setPrev, (e) => { setPrev(null); alertDialog(e.message); });
  const apply = async () => {
    if (!prev) return;
    if (!(await confirmDialog(`Re-score ${prev.promote + prev.demote} attempt${prev.promote + prev.demote === 1 ? "" : "s"} on revision ${prev.from} with the corrected key? ${prev.promote} will pass now and open a certification. ${prev.demote} pass${prev.demote === 1 ? "" : "es"} will wait for a lead to keep or revoke. This can't be undone.`, { ok: "Apply regrade" }))) return;
    training<{ promoted: number; pending: number }>("regradeApply", { from, to }).then((r) => { alertDialog(`Done: ${r.promoted} now pass, ${r.pending} waiting for a decision.`); setPrev(null); if (test !== "") loadList(test as number); }, (e) => alertDialog(e.message));
  };
  const decide = async (id: number, decision: "keep" | "revoke") => {
    const why = await promptDialog(decision === "revoke" ? "Why is this pass being taken back? The member is emailed this reason." : "Why is the pass being kept? This goes in the audit log.", "", { multiline: true, ok: decision === "revoke" ? "Revoke pass" : "Keep pass" });
    if (why === null) return;
    training("regradeDecide", { item: id, decision, reason: why }).then(() => loadList(test as number), (e) => alertDialog(e.message));
  };
  return (
    <section>
      <h2>Regrade a wrong answer key</h2>
      <p className="sub">Use this when a question&apos;s correct answer was wrong. Save the corrected answer in a new published version (a minor change), then pick the version people took and the corrected one. Nobody re-tests: their stored answers are scored again. Passes that were missed now pass at once and open a certification. Passes that the corrected key would fail are never taken back by the script; a lead decides below.</p>
      <div className="bar" style={{ flexWrap: "wrap" }}>
        <label>Test <select value={test} onChange={(e) => setTest(e.target.value === "" ? "" : Number(e.target.value))}><option value="">Choose a test…</option>{tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.tool})</option>)}</select></label>
        <label>People took <select value={from} onChange={(e) => { setFrom(e.target.value === "" ? "" : Number(e.target.value)); setPrev(null); }} disabled={!revs.length}><option value="">Version…</option>{revs.filter((r) => r.status !== "draft").map((r) => <option key={r.id} value={r.id}>Revision {r.rev_no} ({r.status})</option>)}</select></label>
        <label>Corrected <select value={to} onChange={(e) => { setTo(e.target.value === "" ? "" : Number(e.target.value)); setPrev(null); }} disabled={!revs.length}><option value="">Version…</option>{revs.filter((r) => r.status === "published").map((r) => <option key={r.id} value={r.id}>Revision {r.rev_no}</option>)}</select></label>
        <button disabled={!ready} onClick={check}>Preview</button>
      </div>
      {prev && (
        <div className="card">
          <p><b>{prev.promote}</b> will pass now · <b>{prev.demote}</b> pass{prev.demote === 1 ? "" : "es"} for a lead to decide · {prev.same} unchanged</p>
          {prev.in_progress > 0 && <p className="sub" role="alert">{prev.in_progress} {prev.in_progress === 1 ? "person is" : "people are"} still taking this version. Apply once they&apos;ve finished.</p>}
          {prev.changes.length > 0 && <ul>{prev.changes.map((c) => <li key={c.attempt}>{c.name} ({c.email}): {c.old_pct}% → {c.new_pct}%, {c.kind === "promote" ? "now passes" : "would fail"}</li>)}</ul>}
          {canOverride && (prev.promote + prev.demote) > 0 && prev.in_progress === 0 && <div className="bar"><button className="pri" onClick={apply}>Apply regrade…</button></div>}
          {!canOverride && <p className="sub">You can preview this. Applying a regrade needs the “Override” special permission.</p>}
        </div>
      )}
      {list && list.pending.length > 0 && (
        <>
          <h3>Waiting for a decision</h3>
          <div className="card">{list.pending.map((p) => (
            <div className="row" key={p.id}>
              <span>{p.name} ({p.email}) · revision {p.from_rev} · {p.old_pct}% → {p.new_pct}%</span>
              {canOverride && <span className="bar"><button onClick={() => decide(p.id, "keep")}>Keep pass</button><button onClick={() => decide(p.id, "revoke")}>Revoke pass</button></span>}
            </div>
          ))}</div>
        </>
      )}
      {list && list.runs.length > 0 && (
        <>
          <h3>Applied</h3>
          <ul>{list.runs.map((r) => <li key={r.id}>Revision {r.from_rev} re-scored with revision {r.to_rev}, by {r.applied_by} on {new Date(r.applied_at).toLocaleDateString()}: {r.promoted} now pass, {r.pending} pending, {r.kept} kept, {r.revoked} revoked</li>)}</ul>
        </>
      )}
    </section>
  );
}
