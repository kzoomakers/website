"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmDialog, promptDialog } from "@/components/dialog";
import { ImageInput } from "@/components/image-field";
import { fail, rpc } from "../rpc";

type Block = { id: string; type: string; [k: string]: any };
type Lesson = { id: number; section_id: number; title: string; problems: string[] };
type Full = { id: number; title: string; blocks: Block[]; completion: { rule: string; percent?: number } };
type Section = { id: number; title: string; lessons: Lesson[] };
type Course = { id: number; slug: string; title: string; summary: string; status: string; sequential: boolean; change_note: string; sections: Section[]; trashed: { id: number; title: string }[] };

const KINDS = ["danger", "warning", "ppe", "tip"];
const newBlock = (type: string): Block => ({ id: Math.random().toString(36).slice(2, 10), type, ...({ text: { html: "" }, video: { yt: "", caption: "", transcript: "", chapters: [] }, image: { src: "", alt: "", caption: "" }, doc: { docId: 0, mode: "card" }, callout: { kind: "warning", text: "" }, checklist: { items: [""] }, quiz: { testId: 0 }, divider: {} } as any)[type] });
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const parseChapters = (s: string) => s.split("\n").map((l) => l.match(/^\s*(?:(\d+):)?(\d+)\s+(.+)$/)).filter(Boolean).map((m) => ({ time: Number(m![1] ?? 0) * 60 + Number(m![2]), label: m![3] }));

function BlockEditor({ b, set, docs, tests }: { b: Block; set: (b: Block) => void; docs: { id: number; title: string }[]; tests: { id: number; title: string }[] }) {
  const up = (k: string) => (e: React.ChangeEvent<any>) => set({ ...b, [k]: e.target.value });
  const [chap, setChap] = useState(() => (b.chapters ?? []).map((c: any) => `${mmss(c.time)} ${c.label}`).join("\n"));
  switch (b.type) {
    case "text": return <textarea aria-label="Text (plain, or HTML)" rows={6} style={{ width: "100%" }} value={b.html} onChange={up("html")} />;
    case "video": return (
      <div style={{ display: "grid", gap: 4 }}>
        <input aria-label="YouTube link" placeholder="Paste a YouTube link" value={b.yt} onChange={up("yt")} />
        <div className="bar"><label>Start (sec) <input type="number" min={0} value={b.start ?? ""} onChange={up("start")} /></label><label>End (sec) <input type="number" min={0} value={b.end ?? ""} onChange={up("end")} /></label></div>
        <input aria-label="Caption" placeholder="Caption" value={b.caption} onChange={up("caption")} />
        <textarea aria-label="Chapters, one per line: 1:30 Setting the fence" rows={3} placeholder="Chapters, one per line: 1:30 Setting the fence" value={chap} onChange={(e) => setChap(e.target.value)} onBlur={() => set({ ...b, chapters: parseChapters(chap) })} />
        <textarea aria-label="Transcript" rows={4} placeholder="Transcript (helps people who can't hear the video)" value={b.transcript} onChange={up("transcript")} />
      </div>);
    case "image": return (
      <div style={{ display: "grid", gap: 4 }}>
        <ImageInput value={b.src} onChange={(v) => set({ ...b, src: v })} />
        <input aria-label="Describe the picture (required)" placeholder="Describe the picture for people who can't see it (required)" value={b.alt} onChange={up("alt")} />
        <input aria-label="Caption" placeholder="Caption (optional)" value={b.caption} onChange={up("caption")} />
      </div>);
    case "doc": return (
      <div className="bar">
        <select aria-label="Library document" value={b.docId} onChange={(e) => set({ ...b, docId: Number(e.target.value) })}><option value={0}>Choose a document…</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
        <select aria-label="How to show it" value={b.mode} onChange={up("mode")}><option value="card">Link card</option><option value="inline">Show inline</option></select>
      </div>);
    case "callout": return (
      <div className="bar"><select aria-label="Kind" value={b.kind} onChange={up("kind")}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select><input aria-label="Callout text" style={{ flex: 1 }} value={b.text} onChange={up("text")} /></div>);
    case "checklist": return <textarea aria-label="Checklist items, one per line" rows={4} style={{ width: "100%" }} value={b.items.join("\n")} onChange={(e) => set({ ...b, items: e.target.value.split("\n") })} />;
    case "quiz": return (
      <div className="bar">
        <select aria-label="Practice quiz" value={b.testId} onChange={(e) => set({ ...b, testId: Number(e.target.value) })}><option value={0}>Choose a test…</option>{tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
        <input aria-label="Only questions tagged (comma separated)" placeholder="Only these tags (optional)" defaultValue={(b.tags ?? []).join(", ")} onBlur={(e) => set({ ...b, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
        <label>Questions <input type="number" min={1} max={100} style={{ width: 60 }} placeholder="all" value={b.count ?? ""} onChange={(e) => set({ ...b, count: e.target.value ? Number(e.target.value) : undefined })} /></label>
      </div>);
    default: return <hr />;
  }
}

function LessonEditor({ lesson, docs, tests, onSaved, canEdit }: { canEdit: boolean; lesson: Full & { problems: string[] }; docs: { id: number; title: string }[]; tests: { id: number; title: string }[]; onSaved: (id: number, title: string, problems: string[]) => void }) {
  const [l, setL] = useState<Full>(lesson), [sig, setSig] = useState(false), [state, setState] = useState<"saved" | "saving" | "dirty">("saved"), [problems, setProblems] = useState(lesson.problems), timer = useRef<any>(undefined);
  const latest = useRef({ l, sig }); latest.current = { l, sig };
  const save = useCallback(async () => {
    clearTimeout(timer.current); setState("saving");
    const { l, sig } = latest.current;
    try {
      const r = await rpc("saveLesson", { id: l.id, title: l.title, blocks: l.blocks, completion: l.completion, significant: sig });
      setProblems(r.problems); setState(latest.current.l === l ? "saved" : "dirty"); if (r.dropped) fail(new Error(`${r.dropped} block(s) were left out: a video link that isn't YouTube, or an empty callout or checklist.`));
      setSig(false); onSaved(l.id, r.title, r.problems);
    } catch (e) { setState("dirty"); fail(e); }
  }, [onSaved]);
  const edit = (n: Full) => { setL(n); setState("dirty"); clearTimeout(timer.current); timer.current = setTimeout(save, 2000); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const blocks = l.blocks, put = (bs: Block[]) => edit({ ...l, blocks: bs });
  const swap = (i: number, j: number) => { if (j < 0 || j >= blocks.length) return; const c = [...blocks]; [c[i], c[j]] = [c[j], c[i]]; put(c); };
  const from = useRef(-1), drop = (to: number) => { const i = from.current; from.current = -1; if (i < 0 || i === to) return; const c = [...blocks]; c.splice(to, 0, c.splice(i, 1)[0]); put(c); };
  return (
    <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <div className="bar"><input aria-label="Lesson title" style={{ flex: 1, fontSize: "1.2em" }} value={l.title} onChange={(e) => edit({ ...l, title: e.target.value })} /><span className="sub" aria-live="polite">{state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "Unsaved changes"}</span><button onClick={save}>Save</button></div>
      {blocks.map((b, i) => (
        <fieldset key={b.id} style={{ margin: "8px 0" }} onDragOver={(e) => from.current >= 0 && e.preventDefault()} onDrop={(e) => { e.preventDefault(); drop(i); }}>
          <legend>{canEdit && <span draggable aria-hidden="true" title="Drag to reorder" style={{ cursor: "grab" }} onDragStart={(e) => { from.current = i; e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => (from.current = -1)}>⠿ </span>}{b.type} <button aria-label="Move block up" onClick={() => swap(i, i - 1)}>↑</button><button aria-label="Move block down" onClick={() => swap(i, i + 1)}>↓</button><button aria-label="Delete block" onClick={() => put(blocks.filter((_, k) => k !== i))}>✕</button></legend>
          <BlockEditor b={b} docs={docs} tests={tests} set={(nb) => put(blocks.map((x, k) => (k === i ? nb : x)))} />
        </fieldset>
      ))}
      <div className="bar">Add: {["text", "image", "video", "doc", "callout", "checklist", "quiz", "divider"].map((t) => <button key={t} onClick={() => put([...blocks, newBlock(t)])}>{t}</button>)}</div>
      <div className="bar">
        <label>Finished when <select value={l.completion.rule} onChange={(e) => edit({ ...l, completion: { rule: e.target.value, percent: l.completion.percent ?? 80 } })}><option value="viewed">they open it</option><option value="done">they press "I've finished"</option><option value="video">they watch the video</option><option value="checklist">they tick every checklist item</option><option value="quiz">they score well on the quiz</option></select></label>
        {(l.completion.rule === "video" || l.completion.rule === "quiz") && <label>at least <input type="number" min={1} max={100} style={{ width: 60 }} value={l.completion.percent ?? 80} onChange={(e) => edit({ ...l, completion: { rule: l.completion.rule, percent: Number(e.target.value) } })} />%</label>}
        <label><input type="checkbox" checked={sig} onChange={(e) => setSig(e.target.checked)} /> This change matters for safety (people who finished it see "changed since you finished")</label>
      </div>
      {problems.length > 0 && <ul role="status">{problems.map((p) => <li key={p}>⚠️ {p}</li>)}</ul>}
    </fieldset>
  );
}

export default function Editor({ id, canEdit }: { id: number; canEdit: boolean }) {
  const [c, setC] = useState<Course | null>(null), [open, setOpen] = useState<number | null>(null), [full, setFull] = useState<(Full & { problems: string[] }) | null>(null), [docs, setDocs] = useState<{ id: number; title: string }[]>([]), [tests, setTests] = useState<{ id: number; title: string }[]>([]), [meta, setMeta] = useState({ title: "", summary: "", change_note: "" });
  const first = useRef(true);
  const reload = useCallback(() => rpc("get", { id }).then((r: Course) => { if (first.current) { first.current = false; setMeta({ title: r.title, summary: r.summary, change_note: r.change_note }); } setC(r); }, fail), [id]);
  useEffect(() => { reload(); rpc("docs").then(setDocs, () => {}); rpc("practiceTests").then(setTests, () => {}); }, [reload]);
  // One lesson's blocks load when it is opened; saving it only updates its title and warnings in the outline, so typing never reloads the whole course.
  useEffect(() => { setFull(null); if (open) rpc("lesson", { id: open }).then((l: Full) => setFull({ ...l, problems: [] }), fail); }, [open]);
  const onSaved = useCallback((lid: number, title: string, problems: string[]) => setC((x) => x && { ...x, sections: x.sections.map((s) => ({ ...s, lessons: s.lessons.map((l) => (l.id === lid ? { ...l, title, problems } : l)) })) }), []);
  if (!c) return <p>Loading…</p>;
  const act = (op: string, args: object) => rpc(op, { id, ...args }).then(reload, fail);
  const ask = async (q: string, def = "") => (await promptDialog(q, def))?.trim();
  return (
    <div>
      <p><a href="/admin/learning">← All courses</a></p>
      <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {!canEdit && <p className="sub" role="status">You can look at this course but not change it.</p>}
      <div className="bar" style={{ flexWrap: "wrap" }}>
        <input aria-label="Course title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
        <select aria-label="Status" value={c.status} onChange={(e) => act("edit", { status: e.target.value })}><option>draft</option><option>published</option><option>archived</option></select>
        <label><input type="checkbox" checked={c.sequential} onChange={(e) => act("edit", { sequential: e.target.checked })} /> Lessons unlock in order</label>
        <button onClick={() => act("edit", meta)}>Save details</button>
        <a href={`/members/courses/${c.slug}?preview=1`} target="_blank" rel="noreferrer">Preview as a member</a>
        <button onClick={() => rpc("duplicate", { id }).then((r) => (location.href = `/admin/learning/${r.id}`), fail)}>Duplicate</button>
        <button onClick={() => rpc("export", { id }).then((x) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(x, null, 2)], { type: "application/json" })); a.download = `${c.slug}.json`; a.click(); URL.revokeObjectURL(a.href); }, fail)}>Export</button>
        <button onClick={async () => (await confirmDialog(`Move "${c.title}" to the recycle bin?`)) && rpc("delete", { id }).then(() => (location.href = "/admin/learning"), fail)}>Delete</button>
      </div>
      <textarea aria-label="Summary" rows={2} style={{ width: "100%" }} placeholder="Summary members see on the course page" value={meta.summary} onChange={(e) => setMeta({ ...meta, summary: e.target.value })} />
      <input aria-label="What changed (shown to members as 'Updated…')" style={{ width: "100%" }} placeholder="What changed in this update? (optional)" value={meta.change_note} onChange={(e) => setMeta({ ...meta, change_note: e.target.value })} />
      </fieldset>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", marginTop: 12 }}>
        <nav aria-label="Course outline" style={{ flex: "1 1 220px" }}>
          {c.sections.map((s) => (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <b>{s.title}</b>{" "}
              {canEdit && <><button aria-label="Move section up" onClick={() => rpc("move", { kind: "section", id: s.id, dir: "up" }).then(reload, fail)}>↑</button><button aria-label="Move section down" onClick={() => rpc("move", { kind: "section", id: s.id, dir: "down" }).then(reload, fail)}>↓</button>
                <button onClick={async () => { const t = await ask("Rename section", s.title); if (t) rpc("renameSection", { id: s.id, title: t }).then(reload, fail); }}>Rename</button>
                <button onClick={async () => (await confirmDialog(`Delete the section "${s.title}"? Lessons from it that are already in the recycle bin are removed for good.`)) && rpc("deleteSection", { id: s.id }).then(reload, fail)}>Delete</button></>}
              {s.lessons.map((x) => (
                <div key={x.id}>
                  <button style={{ fontWeight: x.id === open ? "bold" : undefined }} onClick={() => setOpen(x.id)}>{x.title || "(untitled)"}{x.problems.length ? " ⚠️" : ""}</button>
                  {canEdit && <><button aria-label="Move lesson up" onClick={() => rpc("move", { kind: "lesson", id: x.id, dir: "up" }).then(reload, fail)}>↑</button><button aria-label="Move lesson down" onClick={() => rpc("move", { kind: "lesson", id: x.id, dir: "down" }).then(reload, fail)}>↓</button>
                    <button aria-label={`Delete ${x.title}`} onClick={async () => { if (await confirmDialog(`Delete the lesson "${x.title}"? It goes to the recycle bin.`)) { if (open === x.id) setOpen(null); rpc("deleteLesson", { id: x.id }).then(reload, fail); } }}>✕</button></>}
                </div>
              ))}
              {canEdit && <button onClick={async () => { const t = await ask("Lesson title"); if (t) rpc("addLesson", { id: s.id, title: t }).then(reload, fail); }}>+ Lesson</button>}
            </div>
          ))}
          {canEdit && c.trashed.length > 0 && <details><summary>Deleted lessons ({c.trashed.length})</summary>{c.trashed.map((t) => <div key={t.id}>{t.title} <button onClick={() => rpc("restoreLesson", { id: t.id }).then(reload, fail)}>Restore</button></div>)}<span className="sub">Kept for 30 days.</span></details>}
          {canEdit && <button onClick={async () => { const t = await ask("Section title"); if (t) act("addSection", { title: t }); }}>+ Section</button>}
        </nav>
        <div style={{ flex: "3 1 420px" }}>{full ? <LessonEditor key={full.id} canEdit={canEdit} lesson={full} docs={docs} tests={tests} onSaved={onSaved} /> : open ? <p className="sub">Loading…</p> : <p className="sub">Pick a lesson to edit it.</p>}</div>
      </div>
    </div>
  );
}
