"use client";
import { useEffect, useState } from "react";
import { alertDialog } from "@/components/dialog";
import { fail, rpc } from "../rpc";

type Doc = { id: number; title: string };
type L = { docs: { id: number; role: string; tier: string; type: string; title: string }[]; courses: { id: number }[]; require_course: boolean; require_ack: boolean };
const ROLES = ["manual", "sop", "safety"];

// What a tool links to, and whether the real test waits for it. Both switches are off by default, so nothing changes until someone turns one on.
export default function ToolsAdmin({ canEdit }: { canEdit: boolean }) {
  const [tools, setTools] = useState<{ id: number; name: string }[]>([]), [id, setId] = useState(0), [l, setL] = useState<L | null>(null), [docs, setDocs] = useState<Doc[]>([]), [courses, setCourses] = useState<{ id: number; title: string }[]>([]), [add, setAdd] = useState(0);
  useEffect(() => { rpc("tools").then(setTools, fail); rpc("docs").then(setDocs, fail); rpc("list").then(setCourses, fail); }, []);
  const pick = (n: number) => { setId(n); setL(null); if (n) rpc("toolLearning", { id: n }).then(setL, fail); };
  const save = () => l && rpc("setToolLearning", { id, docs: l.docs, courseIds: l.courses.map((c) => c.id), require_course: l.require_course, require_ack: l.require_ack }).then(() => alertDialog("Saved."), fail);
  const hidden = l?.docs.filter((d) => ["authorized", "staff"].includes(d.tier) && ["sop", "safety"].includes(d.type)) ?? [];
  return (
    <div>
      <h1>Tool learning</h1>
      <p className="sub">Link a tool to its manuals, SOPs and courses. Members see them on the tool's card. You can also make the course and/or the SOP read-and-confirm a requirement before the test starts.</p>
      <label>Tool <select value={id} onChange={(e) => pick(Number(e.target.value))}><option value={0}>Choose…</option>{tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {l && (
        <div>
          <h2>Documents</h2>
          {l.docs.map((d, i) => <div key={d.id}>{d.title} <select aria-label="Role" disabled={!canEdit} value={d.role} onChange={(e) => setL({ ...l, docs: l.docs.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)) })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select> {canEdit && <button onClick={() => setL({ ...l, docs: l.docs.filter((_, k) => k !== i) })}>Remove</button>}</div>)}
          {canEdit && <div className="bar"><select aria-label="Add a document" value={add} onChange={(e) => setAdd(Number(e.target.value))}><option value={0}>Add a document…</option>{docs.filter((d) => !l.docs.some((x) => x.id === d.id)).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select><button disabled={!add} onClick={() => { const d = docs.find((x) => x.id === add)!; setL({ ...l, docs: [...l.docs, { id: d.id, title: d.title, role: "manual", tier: "members", type: "manual" }] }); setAdd(0); }}>Add</button></div>}
          {hidden.length > 0 && <p role="status">⚠️ {hidden.map((d) => d.title).join(", ")} can only be seen by authorized members or staff, so it can't be a requirement for someone who isn't authorized yet. Set it to "All members" in the library.</p>}
          <h2>Courses</h2>
          {courses.map((c) => <label key={c.id} style={{ display: "block" }}><input type="checkbox" disabled={!canEdit} checked={l.courses.some((x) => x.id === c.id)} onChange={(e) => setL({ ...l, courses: e.target.checked ? [...l.courses, { id: c.id }] : l.courses.filter((x) => x.id !== c.id) })} /> {c.title}</label>)}
          <h2>Before the real test</h2>
          <label style={{ display: "block" }}><input type="checkbox" disabled={!canEdit} checked={l.require_course} onChange={(e) => setL({ ...l, require_course: e.target.checked })} /> Members must finish the linked course(s)</label>
          <label style={{ display: "block" }}><input type="checkbox" disabled={!canEdit} checked={l.require_ack} onChange={(e) => setL({ ...l, require_ack: e.target.checked })} /> Members must read and confirm the linked SOP and safety documents</label>
          <p className="sub">Both apply only while courses / the library are switched on for members. A test already in progress is not interrupted.</p>
          {canEdit && <button className="btn" onClick={save}>Save</button>}
        </div>
      )}
    </div>
  );
}
