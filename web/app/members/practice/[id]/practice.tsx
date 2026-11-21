"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import QuestionView, { Rich, type MemberQ } from "@/components/training/question";

type View = { id: number; testId: number; title: string; realTest: boolean; total: number; answered: number; correct: number } & ({ done: false; question: MemberQ } | { done: true; pct: number; missed: { id: number; prompt: string; answer: string; feedback_html: string }[] });
type Verdict = { correct: boolean; partial: boolean; answer: string; feedback_html: string };
const call = async (body: object) => { const r = await fetch("/api/practice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

// One question at a time. Practice never counts toward a tool authorization; the real test is a separate page.
export default function Practice({ testId, tags = [], n }: { testId: number; tags?: string[]; n?: number }) {
  const [v, setV] = useState<View>(), [answer, setAnswer] = useState<any>(), [verdict, setVerdict] = useState<Verdict>(), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const run = (body: object) => { setBusy(true); call(body).then((x) => { setV(x); setAnswer(undefined); setVerdict(undefined); setErr(""); }, (e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(() => { run({ op: "start", testId, tags, n }); }, [testId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return err ? <p role="alert">{err}</p> : <p className="sub">Loading…</p>;
  if (v.done) return (
    <div>
      <h2>{v.title}: {v.pct}%</h2>
      <p>{v.correct} of {v.total} right. Practice doesn't count toward anything, so try as often as you like.</p>
      {v.missed.length > 0 && <><h3>Review these</h3>{v.missed.map((m) => <div key={m.id} style={{ marginBottom: 12 }}><p>{m.prompt}</p><p className="sub">Right answer: {m.answer}</p>{m.feedback_html && <Rich html={m.feedback_html} className="sub" />}</div>)}
        <button className="btn" disabled={busy} onClick={() => run({ op: "start", testId, retry: true })}>Retry the {v.missed.length} you missed</button> </>}
      <button disabled={busy} onClick={() => run({ op: "start", testId })}>Start over</button>{" "}
      {v.realTest && <Link className="btn" href={`/members/training/test/${testId}`}>Take the real test</Link>} <Link href="/members/courses">Back to courses</Link>
    </div>
  );
  const q = v.question;
  const submit = async () => { setBusy(true); try { setVerdict(await call({ op: "answer", id: v.id, qid: q.id, answer })); setErr(""); } catch (e: any) { setErr(e.message); } setBusy(false); };
  return (
    <div style={{ maxWidth: "68ch" }}>
      <p className="sub">{v.title} · question {v.answered + 1} of {v.total}</p>
      <QuestionView q={q} value={answer} onChange={setAnswer} disabled={!!verdict || busy} />
      {verdict && <div role="status"><p><b>{verdict.correct ? "✅ Correct" : verdict.partial ? "◐ Partly right" : "❌ Not quite"}</b></p>{!verdict.correct && <p>Right answer: {verdict.answer}</p>}{verdict.feedback_html && <Rich html={verdict.feedback_html} />}</div>}
      {err && <p role="alert">{err}</p>}
      {verdict ? <button className="btn" disabled={busy} onClick={() => run({ op: "view", id: v.id })}>{v.answered + 1 === v.total ? "See results" : "Next"}</button> : <button className="btn" disabled={busy || answer === undefined || answer === ""} onClick={submit}>Check answer</button>}
    </div>
  );
}
