"use client";
import { useEffect, useState } from "react";
import { fail, rpc } from "../rpc";

type T = { id: number; title: string; tool: boolean; published: boolean };
type Q = { qkey: string; type: string; prompt: string; tags: string[]; practice_ok: boolean; status: string };

// Which questions of a test members may practise on. Tool tests offer only flagged questions; a test with no tool is a standalone quiz and offers all of them.
export default function PracticeAdmin({ canEdit }: { canEdit: boolean }) {
  const [tests, setTests] = useState<T[]>([]), [id, setId] = useState(0), [qs, setQs] = useState<Q[]>([]);
  useEffect(() => { rpc("practiceTests").then(setTests, fail); }, []);
  const load = (n: number) => { setId(n); if (n) rpc("practiceQs", { id: n }).then(setQs, fail); else setQs([]); };
  const t = tests.find((x) => x.id === id);
  const set = (q: Q, patch: Partial<Q>) => { setQs((l) => l.map((x) => (x.qkey === q.qkey ? { ...x, ...patch } : x))); return rpc("setPractice", { qkey: q.qkey, ...patch }).catch(fail); };
  const [title, setTitle] = useState(""), [text, setText] = useState(""), [out, setOut] = useState("");
  const make = () => rpc("createQuiz", { title, text }).then((r: { id: number; count: number }) => { setTitle(""); setText(""); setOut(`Created with ${r.count} questions.`); return rpc("practiceTests").then((l: T[]) => { setTests(l); load(r.id); }); }, fail);
  const exp = () => rpc("exportQuiz", { id }).then((r: { text: string; skipped: number }) => setOut(r.text + (r.skipped ? `\n\n(${r.skipped} question(s) of other types left out.)` : "")), fail);
  return (
    <div>
      <h1>Practice quizzes</h1>
      <p className="sub">Members practise on a test's questions with instant feedback. It never counts toward a tool authorization. Tool tests offer only questions you switch on here, so the real test can't be memorised; a test with no tool is a standalone quiz and offers every question. Write the questions in Training.</p>
      <label>Test <select value={id} onChange={(e) => load(Number(e.target.value))}><option value={0}>Choose…</option>{tests.map((x) => <option key={x.id} value={x.id}>{x.title}{x.tool ? "" : " (standalone)"}{x.published ? "" : " (not published)"}</option>)}</select></label>
      {t && !t.published && <p role="status">This test has no published version, so members can't practise on it yet.</p>}
      {t?.tool && canEdit && <p><button onClick={() => rpc("setAllPractice", { id, on: true }).then(() => load(id), fail)}>Switch on for all</button> <button onClick={() => rpc("setAllPractice", { id, on: false }).then(() => load(id), fail)}>Switch off for all</button></p>}
      {id > 0 && <p><button onClick={exp}>Export questions as text</button></p>}
      {canEdit && <details><summary>New standalone quiz from text</summary>
        <input aria-label="Quiz title" placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea aria-label="Questions" rows={10} style={{ width: "100%" }} placeholder={"Which guard stops kickback?\nA. Riving knife\nB. Fence\nANSWER: A\nFEEDBACK: optional\nTAGS: table saw\n\n(blank line between questions; ANSWER: True / False for true-false; ANSWER: A, C for several)"} value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={make}>Create and publish</button></details>}
      {out && <pre style={{ whiteSpace: "pre-wrap" }}>{out}</pre>}
      {qs.map((q) => (
        <div className="row" key={q.qkey}>
          {t?.tool && <label><input type="checkbox" disabled={!canEdit} checked={q.practice_ok} onChange={(e) => set(q, { practice_ok: e.target.checked })} /> practice </label>}
          <span>{q.prompt || "(no text)"}</span> <span className="tag">{q.type}</span>
          <input aria-label="Tags, comma separated" placeholder="Tags" disabled={!canEdit} defaultValue={q.tags.join(", ")} onBlur={(e) => set(q, { tags: e.target.value.split(",") as any })} />
        </div>
      ))}
    </div>
  );
}
