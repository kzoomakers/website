"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { alertDialog } from "@/components/dialog";
import { training } from "../rpc";

type Row = { id: number; title: string; archived: boolean; tool: string; category: string; published_rev: number | null; draft_rev: number | null; questions: number; attempts: number; pass_rate: number | null };

export default function Tests({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null), [free, setFree] = useState<{ id: number; name: string; category: string }[]>([]), [pick, setPick] = useState("");
  const load = useCallback(() => Promise.all([training<Row[]>("tests"), training("toolsFree")]).then(([r, f]) => { setRows(r); setFree(f); }, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const live = (rows ?? []).filter((r) => !r.archived), old = (rows ?? []).filter((r) => r.archived);
  const row = (t: Row) => (
    <div className="row" key={t.id}>
      <Link href={`/admin/people/training/tests/${t.id}`} className="grow"><b>{t.tool}</b> <span className="sub" style={{ margin: 0 }}>{t.title}</span></Link>
      {t.category && <span className="tag">{t.category}</span>}
      <span className="tag">{t.published_rev ? `Revision ${t.published_rev} live` : "Not published"}</span>
      {t.draft_rev && <span className="tag pri">Draft {t.draft_rev}</span>}
      <span className="tag">{t.questions} question{t.questions === 1 ? "" : "s"}</span>
      {t.attempts > 0 && <span className="tag">{t.attempts} attempts{t.pass_rate !== null ? `, ${t.pass_rate}% pass` : ""}</span>}
    </div>
  );
  return (
    <>
      <h1>Training tests</h1>
      <p className="sub">One test per tool. Build it as a draft, preview it, then publish it as a revision. Members take the published revision; passing it puts them in the sign-off queue.</p>
      {canEdit && (
        <form className="bar" onSubmit={async (e) => { e.preventDefault(); if (!pick) return; try { const r = await training<{ id: number }>("createTest", { tool: +pick }); location.href = `/admin/people/training/tests/${r.id}`; } catch (x: any) { alertDialog(x.message); } }}>
          <select aria-label="Tool" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">New test for which tool…</option>{free.map((t) => <option key={t.id} value={t.id}>{t.category ? `${t.category}: ` : ""}{t.name}</option>)}</select>
          <button className="pri" disabled={!pick}>Create test</button>
          {rows && !free.length && <span className="sub" style={{ margin: 0 }}>Every tool already has a test. Add tools under Tools &amp; sign-offs.</span>}
        </form>
      )}
      <div className="card">{rows === null ? <p className="sub">Loading…</p> : live.length ? live.map(row) : <p className="sub">No tests yet.</p>}</div>
      {old.length > 0 && <><h2>Archived</h2><div className="card">{old.map(row)}</div></>}
    </>
  );
}
