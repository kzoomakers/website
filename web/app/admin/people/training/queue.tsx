"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { alertDialog } from "@/components/dialog";
import HandsOn from "./handson";
import { training } from "./rpc";

type Row = { id: number; state: string; name: string; email: string; tool: string; category: string; pct: number | null; waiting: number; signoffs: number; signoffs_required: number; trainers: string | null; certified_at: string | null; can: boolean };
const TABS = [["ready", "Ready for review"], ["training", "In training"], ["attention", "Needs attention"], ["done", "Recently certified"]] as const;
const inTab = (t: string, r: Row) => t === "ready" ? r.state === "passed" : t === "training" ? r.state === "in_training" || r.state === "ready" : t === "done" ? r.state === "certified" : r.state !== "certified" && (r.waiting > 7 || !r.trainers);

export default function Queue() {
  const [rows, setRows] = useState<Row[] | null>(null), [tab, setTab] = useState<(typeof TABS)[number][0]>("ready"), [tool, setTool] = useState(""), [q, setQ] = useState("");
  const load = () => training<{ rows: Row[] }>("queue").then((r) => setRows(r.rows), (e) => alertDialog(e.message));
  useEffect(() => { load(); }, []);
  const pick = (id: number) => training("startTraining", { id }).then(load, (e) => alertDialog(e.message));
  const tools = [...new Set((rows ?? []).map((r) => r.tool))].sort(), s = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => inTab(tab, r) && (!tool || r.tool === tool) && (!s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)));
  return (
    <>
      <h1>Training sign-off queue</h1>
      <p className="sub">People who passed a test. Press Pick up to take someone on (they get told), or open them to see their answers, add notes, and sign them off. Signing off is what gives them the tool authorization.</p>
      {(rows ?? []).some((r) => !r.trainers && r.state !== "certified") && <p className="sub" role="alert">Some people are waiting on a tool with no trainer. Until one is assigned, only administrators can sign them off. <Link href="/admin/people/training/trainers">Assign trainers</Link></p>}
      <HandsOn />
      <div className="bar">
        {TABS.map(([k, label]) => <button key={k} className={tab === k ? "pri" : ""} onClick={() => setTab(k)}>{label}{rows ? ` (${rows.filter((r) => inTab(k, r)).length})` : ""}</button>)}
        <select aria-label="Tool" value={tool} onChange={(e) => setTool(e.target.value)}><option value="">All tools</option>{tools.map((t) => <option key={t}>{t}</option>)}</select>
        <input aria-label="Search members" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card">
        {rows === null ? <p className="sub">Loading…</p> : !shown.length ? <p className="sub">{rows.length ? "Nothing here." : "Nothing in your queue. If you expected people here, ask an administrator to assign you as a trainer for your tools."}</p> : shown.map((r) => (
          <div className="row" key={r.id} style={{ flexWrap: "wrap", gap: 6 }}>
            <Link href={`/admin/people/training/cert/${r.id}`} className="grow" style={{ minWidth: 180 }}><b>{r.name}</b> <span className="sub" style={{ margin: 0 }}>{r.tool}</span></Link>
            {r.pct !== null && <span className="tag">{Math.round(r.pct)}%</span>}
            {r.state === "certified" ? <span className="tag">Certified</span> : <span className="tag" style={r.waiting > 7 ? { color: "#b00020" } : r.waiting > 3 ? { color: "#b26a00" } : undefined}>{r.waiting}d waiting</span>}
            {r.signoffs_required > 1 && <span className="tag">{r.signoffs}/{r.signoffs_required} sign-offs</span>}
            {r.state === "passed" && r.can && <button className="pri" onClick={() => pick(r.id)}>Pick up</button>}
            {r.trainers ? <span className="tag">Trainers: {r.trainers}</span> : <Link className="tag" href="/admin/people/training/trainers" style={{ color: "#b00020" }}>No trainer assigned: fix</Link>}
          </div>
        ))}
      </div>
    </>
  );
}
