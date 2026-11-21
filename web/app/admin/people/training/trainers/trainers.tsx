"use client";
import { useCallback, useEffect, useState } from "react";
import { alertDialog } from "@/components/dialog";
import { training } from "../rpc";

type Tool = { id: number; name: string; category: string; signoffs_required: number; validity_months: number | null; manual_grant_allowed: boolean; awaiting: number; certified: number; trainers: { id: number; name: string }[]; has_test: boolean };

function Row({ t, canEdit, reload }: { t: Tool; canEdit: boolean; reload: () => void }) {
  const [q, setQ] = useState(""), [hits, setHits] = useState<{ id: number; name: string; email: string }[]>([]);
  const [s, setS] = useState({ signoffs_required: t.signoffs_required, validity_months: t.validity_months ?? "" as number | "", manual_grant_allowed: t.manual_grant_allowed });
  const fail = (e: any) => alertDialog(e.message);
  return (
    <div className="row" style={{ display: "block" }}>
      <b>{t.name}</b> {t.category && <span className="tag">{t.category}</span>} <span className="tag">{t.has_test ? "Test live" : "No test yet"}</span> <span className="tag">{t.certified} authorized</span> {t.awaiting > 0 && <span className="tag pri">{t.awaiting} awaiting</span>}
      <div>{t.trainers.length ? t.trainers.map((x) => <span className="tag" key={x.id}>{x.name}{canEdit && <button aria-label={`Remove ${x.name}`} onClick={() => training("setTrainer", { tool: t.id, user: x.id, on: false }).then(reload, fail)}> ×</button>}</span>) : <span className="sub" style={{ margin: 0 }}>No trainer assigned: nobody can sign people off on this tool except administrators.</span>}</div>
      {canEdit && (
        <>
          <div className="bar">
            <input aria-label={`Add a trainer for ${t.name}`} placeholder="Add trainer: name or email" value={q} onChange={(e) => { setQ(e.target.value); training("findMembers", { q: e.target.value }).then(setHits, () => setHits([])); }} />
            {q.length > 1 && hits.map((h) => <button key={h.id} onClick={() => training("setTrainer", { tool: t.id, user: h.id, on: true }).then(() => { setQ(""); setHits([]); reload(); }, fail)}>{h.name} ({h.email})</button>)}
          </div>
          <div className="bar">
            <label>Sign-offs needed <input type="number" min={1} max={5} style={{ width: 60 }} value={s.signoffs_required} onChange={(e) => setS({ ...s, signoffs_required: +e.target.value })} /></label>
            <label>Valid for (months) <input type="number" min={1} max={120} style={{ width: 70 }} placeholder="no expiry" value={s.validity_months} onChange={(e) => setS({ ...s, validity_months: e.target.value === "" ? "" : +e.target.value })} /></label>
            <label><input type="checkbox" checked={s.manual_grant_allowed} onChange={(e) => setS({ ...s, manual_grant_allowed: e.target.checked })} /> Allow granting by hand</label>
            <button onClick={() => training("saveToolTraining", { tool: t.id, settings: { ...s, validity_months: s.validity_months === "" ? null : s.validity_months } }).then(reload, fail)}>Save</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Trainers({ canEdit }: { canEdit: boolean }) {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const load = useCallback(() => training<Tool[]>("trainers").then(setTools, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <h1>Trainers</h1>
      <p className="sub">A trainer sees and signs off only the tools listed here. Sign-offs needed and validity apply to people who pass from now on.</p>
      <div className="card">{tools === null ? <p className="sub">Loading…</p> : tools.map((t) => <Row key={`${t.id}:${t.trainers.length}`} t={t} canEdit={canEdit} reload={load} />)}</div>
    </>
  );
}
