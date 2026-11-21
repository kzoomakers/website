"use client";
import { useCallback, useEffect, useState } from "react";
import { promptDialog } from "@/components/dialog";
import { fail, rpc } from "./rpc";

type Course = { id: number; title: string; summary: string; status: string; lessons: number };

export default function Courses({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<Course[] | null>(null), [trash, setTrash] = useState(false), [on, setOn] = useState<boolean | null>(null);
  const reload = useCallback(() => rpc("list", { trash }).then(setList, fail), [trash]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { rpc("flags").then((f) => setOn(f.courses), () => {}); }, []);
  return (
    <div>
      <h1>Courses</h1>
      <p className="sub">Lessons with text, YouTube videos, library documents and checklists. Members can't see courses until they are published and the switch below is on.</p>
      {canEdit && on !== null && <label><input type="checkbox" checked={on} onChange={(e) => rpc("setFlags", { courses: e.target.checked }).then(() => setOn(e.target.checked), fail)} /> Courses are open to members</label>}
      <div className="bar">
        {canEdit && <button onClick={async () => { const t = await promptDialog("Course title"); if (t) rpc("create", { title: t }).then((r) => (location.href = `/admin/learning/${r.id}`), fail); }}>New course</button>}
        <a href="/admin/learning/practice">Practice quizzes</a> <a href="/admin/learning/tools">Tools</a>
        <label><input type="checkbox" checked={trash} onChange={(e) => setTrash(e.target.checked)} /> Recycle bin (30 days)</label>
      </div>
      {list === null ? <p>Loading…</p> : !list.length ? <p className="sub">Nothing here yet.</p> : list.map((c) => (
        <div className="row" key={c.id}>
          {trash ? <b>{c.title}</b> : <a href={`/admin/learning/${c.id}`}><b>{c.title}</b></a>} <span className="tag">{c.status}</span> <span className="tag">{c.lessons} lessons</span>
          {canEdit && trash && <button onClick={() => rpc("restore", { id: c.id }).then(reload, fail)}>Restore</button>}
          {c.summary && <div className="sub">{c.summary}</div>}
        </div>
      ))}
    </div>
  );
}
