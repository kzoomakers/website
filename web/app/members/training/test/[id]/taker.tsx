"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QuestionView, { Rich, type MemberQ } from "@/components/training/question";

type Attempt = { attemptId: number; intro_html: string; due_at: string | null; seq: number; answers: Record<string, any>; questions: MemberQ[] };
const call = async (body: object) => { const r = await fetch("/api/training", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

export default function Taker({ testId }: { testId: number }) {
  const [a, setA] = useState<Attempt>(), [answers, setAnswers] = useState<Record<string, any>>({}), [err, setErr] = useState(""), [res, setRes] = useState<any>(), [left, setLeft] = useState<number | null>(null), [busy, setBusy] = useState(false);
  const seq = useRef(0), dirty = useRef(false), timer = useRef<any>(undefined), latest = useRef(answers);
  latest.current = answers;

  useEffect(() => { call({ op: "start", testId }).then((x: Attempt) => { seq.current = x.seq; setA(x); setAnswers(x.answers); }).catch((e) => setErr(e.message)); }, [testId]);
  useEffect(() => { // cosmetic countdown; the server decides when time is really up
    if (!a?.due_at || res) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((new Date(a.due_at!).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [a, res]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current || (a && !res)) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [a, res]);

  const flush = async () => { if (!a) return; const n = ++seq.current; try { await call({ op: "save", attemptId: a.attemptId, answers: latest.current, seq: n }); dirty.current = false; setErr(""); } catch (e: any) { setErr("Couldn't save your answers yet: " + e.message + " Keep this page open."); } };
  const change = (id: number, v: any) => { setAnswers((p) => ({ ...p, [id]: v })); dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(flush, 1500); };
  const submit = async () => {
    if (!a) return;
    const open = a.questions.filter((q) => answers[q.id] === undefined || answers[q.id] === "").length;
    if (open && !confirm(`${open} question${open === 1 ? " is" : "s are"} unanswered. Submit anyway?`)) return;
    clearTimeout(timer.current); setBusy(true);
    try { setRes(await call({ op: "submit", attemptId: a.attemptId, answers })); dirty.current = false; setErr(""); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (res) return (
    <div>
      <h2>{res.status === "expired" ? "Time ran out" : res.passed ? "You passed" : "Not passed this time"}</h2>
      <p>Score: {res.pct}% (pass mark {res.pass_pct}%).{res.passed && " A trainer will sign you off before you can use the tool."}</p>
      {res.questions?.length > 0 && <><h3>{res.review === "all" ? "Answers" : "Questions you missed"}</h3>
        {res.questions.map((q: any) => <div key={q.id} style={{ marginBottom: 12 }}><Rich html={q.prompt_html} />{q.answer && <p className="sub">Right answer: {q.answer}</p>}{q.feedback_html && <Rich html={q.feedback_html} className="sub" />}</div>)}</>}
      <p><Link className="btn" href="/members/training">Back to Training</Link></p>
    </div>
  );
  if (err && !a) return <div><p role="alert">{err}</p><Link href="/members/training">Back to Training</Link></div>;
  if (!a) return <p className="sub">Loading…</p>;
  return (
    <div>
      {left !== null && <p style={{ position: "sticky", top: 0, background: "var(--bg, #fff)", padding: "6px 0", zIndex: 2 }}><b>Time left: {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b></p>}
      <Rich html={a.intro_html} />
      <p className="sub">Your answers are saved as you go and this test is logged. If you lose your connection, come back to Training and press Resume.</p>
      {a.questions.map((q, i) => <QuestionView key={q.id} q={q} n={i + 1} value={answers[q.id]} onChange={(v) => change(q.id, v)} disabled={busy} />)}
      {err && <p role="alert">{err}</p>}
      <button className="btn" onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit"}</button>
    </div>
  );
}
