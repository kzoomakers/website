"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Viewer from "../../../waiver/viewer";

type Block = { id: string; type: string; [k: string]: any };
type Data = { ticks?: Record<string, number[]> };
const CALLOUT: Record<string, [string, string]> = { danger: ["⛔", "DANGER"], warning: ["⚠️", "WARNING"], ppe: ["🥽", "PPE REQUIRED"], tip: ["💡", "TIP"] };
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

// Nothing from Google loads until the member presses play (youtube-nocookie.com, no poster fetched).
function Video({ b }: { b: Block }) {
  const [at, setAt] = useState<number | null>(null);
  const src = (t: number) => `https://www.youtube-nocookie.com/embed/${b.yt}?rel=0&modestbranding=1&autoplay=1${t ? `&start=${t}` : ""}${b.end ? `&end=${b.end}` : ""}`;
  return (
    <figure style={{ margin: "16px 0" }}>
      {at === null
        ? <button type="button" onClick={() => setAt(b.start ?? 0)} style={{ width: "100%", aspectRatio: "16/9", fontSize: "1.4em", background: "#222", color: "#fff", border: 0, borderRadius: 10, cursor: "pointer" }}>▶ Play video{b.caption ? `: ${b.caption}` : ""}<small style={{ display: "block", opacity: 0.7, fontSize: "0.6em" }}>Loads from YouTube when you press play</small></button>
        : <iframe key={at} title={b.caption || "Video"} src={src(at)} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ width: "100%", aspectRatio: "16/9", border: 0, borderRadius: 10 }} />}
      {b.chapters?.length > 0 && <p>{b.chapters.map((c: any, i: number) => <button key={i} type="button" className="tag" onClick={() => setAt(c.time)}>{mmss(c.time)} {c.label}</button>)}</p>}
      {b.caption && <figcaption className="sub">{b.caption} · <a href={`https://www.youtube.com/watch?v=${b.yt}`} target="_blank" rel="noreferrer">Open on YouTube</a></figcaption>}
      {b.transcript && <details><summary>Transcript</summary><p style={{ whiteSpace: "pre-wrap" }}>{b.transcript}</p></details>}
    </figure>
  );
}

export default function Lesson({ slug, q, course, sequential, preview, lesson, data: d0, complete: c0, docs, quizzes, prev, next, position, total }: { slug: string; q: string; course: string; sequential: boolean; preview: boolean; lesson: { id: number; blocks: Block[]; completion: { rule: string } }; data: Data; complete: boolean; docs: Record<number, { slug: string; title: string; pages: number }>; quizzes: Record<number, string>; prev: number | null; next: number | null; position: number; total: number }) {
  const [data, setData] = useState(d0), [complete, setComplete] = useState(c0), [err, setErr] = useState("");
  const send = async (body: object) => {
    if (preview) return;
    try {
      const r = await fetch("/api/courses/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lesson: lesson.id, ...body }) });
      if (!r.ok) return setErr(await r.text());
      const j = await r.json(); setErr(""); setData(j.data); setComplete(j.state === "done");
    } catch { setErr("Couldn't save your progress. Check your connection and try again."); }
  };
  useEffect(() => { send({ action: "view" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rule = lesson.completion.rule, base = `/members/courses/${slug}`, canNext = preview || complete || !sequential;
  return (
    <div style={{ maxWidth: "68ch" }}>
      <p className="sub"><Link href={`${base}${q}`}>{course}</Link> · Lesson {position} of {total}{preview && " · Preview (nothing is saved)"}</p>
      {lesson.blocks.map((b) => {
        switch (b.type) {
          case "text": return <div key={b.id} dangerouslySetInnerHTML={{ __html: b.html }} />; // cleaned on save (lib/courses/blocks.ts)
          case "video": return <Video key={b.id} b={b} />;
          case "callout": { const [icon, label] = CALLOUT[b.kind]; return <div key={b.id} role="note" style={{ border: "3px solid currentColor", borderRadius: 8, padding: 12, margin: "16px 0", fontWeight: b.kind === "tip" ? undefined : 600 }}><b>{icon} {label}</b><div>{b.text}</div></div>; }
          case "checklist": return (
            <ul key={b.id} style={{ listStyle: "none", padding: 0 }}>{b.items.map((t: string, i: number) => (
              <li key={i}><label><input type="checkbox" checked={!!data.ticks?.[b.id]?.includes(i)} onChange={(e) => send({ action: "tick", block: b.id, idx: i, on: e.target.checked })} /> {t}</label></li>
            ))}</ul>);
          case "doc": { const dd = docs[b.docId]; return !dd ? <p key={b.id} className="sub">A document linked here isn't available to you.</p> : b.mode === "inline" ? <div key={b.id}><p><b>{dd.title}</b></p><Viewer src={`/api/library/file/${dd.slug}`} open /></div> : <p key={b.id}><a className="btn" href={`/members/library/${dd.slug}`} target="_blank" rel="noreferrer">📄 {dd.title}</a> <span className="sub">{dd.pages} pages</span></p>; }
          case "quiz": return quizzes[b.testId] ? <p key={b.id}><Link className="btn" href={`/members/practice/${b.testId}`}>📝 Practise: {quizzes[b.testId]}</Link> <span className="sub">Instant feedback; it never counts toward anything.</span></p> : null;
          default: return <hr key={b.id} />;
        }
      })}
      {rule === "done" && !complete && <p><button onClick={() => send({ action: "done" })} disabled={preview}>I've finished this lesson</button></p>}
      {rule === "video" && !complete && <p><button onClick={() => send({ action: "video" })} disabled={preview}>I watched the video</button></p>}
      {rule === "checklist" && !complete && <p className="sub">Tick every item to finish this lesson.</p>}
      {err && <p role="alert">{err}</p>}
      <nav className="bar" aria-label="Lesson navigation" style={{ position: "sticky", bottom: 0 }}>
        {prev ? <Link href={`${base}/${prev}${q}`}>← Back</Link> : <span />}
        <span aria-live="polite">{complete ? "✅ Done" : ""}</span>
        {next ? (canNext ? <Link className="btn" href={`${base}/${next}${q}`}>Next →</Link> : <span className="sub">Finish this lesson to unlock the next</span>) : <Link className="btn" href={`${base}${q}`}>Back to the course</Link>}
      </nav>
    </div>
  );
}
