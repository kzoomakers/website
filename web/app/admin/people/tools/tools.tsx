"use client";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog } from "@/components/dialog";
import { crm } from "../rpc";

type T = { id?: number; name: string; category: string; description: string; authorized?: number };
const BLANK: T = { name: "", category: "", description: "" };

// Machines and tools that need a sign-off. Grant them to people from their page under People.
export default function Tools({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<T[]>([]), [f, setF] = useState<T | null>(null);
  const load = useCallback(() => crm<T[]>("tools").then(setRows, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <h1>Tools &amp; sign-offs</h1>
      <p className="sub">List the machines that need a sign-off (laser, table saw, MIG welder…). Group them with a category such as the shop name. Then grant them to people from their page under People.</p>
      {canEdit && <div className="bar"><button className="pri" onClick={() => setF({ ...BLANK })}>+ New tool</button></div>}
      {f && (
        <form className="card" style={{ display: "grid", gap: 8, padding: 16, marginBottom: 16 }} onSubmit={async (e) => { e.preventDefault(); try { await crm("saveTool", { tool: f }); setF(null); load(); } catch (x: any) { alertDialog(x.message); } }}>
          <label>Name<input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ width: "100%" }} /></label>
          <label>Category / shop<input maxLength={60} placeholder="e.g. Wood shop" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: "100%" }} /></label>
          <label>Notes<textarea rows={2} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ width: "100%" }} /></label>
          <div className="bar"><button className="pri">Save</button><button type="button" onClick={() => setF(null)}>Cancel</button></div>
        </form>
      )}
      <div className="card">
        {rows.map((t) => (
          <div className="row" key={t.id}>
            <span className="grow">{t.name}</span>{t.category && <span className="tag">{t.category}</span>}<span className="tag">{t.authorized} authorized</span>
            {canEdit && <>
              <button onClick={() => setF(t)}>Edit</button>
              <button style={{ color: "var(--bad)" }} onClick={async () => { if (await confirmDialog(`Delete “${t.name}”? Its ${t.authorized} authorization${t.authorized === 1 ? "" : "s"} go too.`, { ok: "Delete", danger: true })) crm("deleteTool", { id: t.id }).then(load, (e) => alertDialog(e.message)); }}>Delete</button>
            </>}
          </div>
        ))}
        {!rows.length && <p className="sub">No tools yet.</p>}
      </div>
    </>
  );
}
