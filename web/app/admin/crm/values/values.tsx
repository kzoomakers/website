"use client";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { FIELDS } from "@/lib/fields";
import { crm } from "../rpc";

type V = { field: string; value: string; members: number };

// What members typed for occupation, company, industry (Other), city, neighborhood and interests. Rename a value to fix a spelling; renaming onto an existing one merges them.
export default function Values({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<V[]>([]), [q, setQ] = useState("");
  const load = useCallback(() => crm<V[]>("fieldValues").then(setRows, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const run = (p: Promise<unknown>) => p.then(load, (e) => alertDialog(e.message));
  return (
    <>
      <h1>Profile values</h1>
      <p className="sub">Tidy what members typed into their profiles. Renaming a value to one that already exists merges the two.</p>
      <div className="bar"><input type="search" aria-label="Filter" placeholder="Filter values" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {(Object.keys(FIELDS) as (keyof typeof FIELDS)[]).filter((f) => FIELDS[f].kind !== "text" && FIELDS[f].kind !== "pick").map((f) => {
        const list = rows.filter((r) => r.field === f && r.value.toLowerCase().includes(q.toLowerCase()));
        return list.length > 0 && (
          <div key={f}>
            <h2>{FIELDS[f].label}</h2>
            <div className="card">
              {list.map((r) => (
                <div className="row" key={r.value}>
                  <span className="grow">{r.value}</span><span className="tag">{r.members} member{r.members === 1 ? "" : "s"}</span>
                  {canEdit && <>
                    <button onClick={async () => { const n = await promptDialog(`Rename or merge “${r.value}” into:`, r.value); if (n && n !== r.value) run(crm("renameValue", { field: f, value: r.value, to: n })); }}>Rename / merge…</button>
                    <button style={{ color: "var(--bad)" }} onClick={async () => { if (await confirmDialog(`Remove “${r.value}” from ${r.members} profile${r.members === 1 ? "" : "s"}?`, { ok: "Remove", danger: true })) run(crm("deleteValue", { field: f, value: r.value })); }}>Remove</button>
                  </>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!rows.length && <p className="sub">Nothing yet. Values appear as members fill in their profiles.</p>}
    </>
  );
}
