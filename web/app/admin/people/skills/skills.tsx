"use client";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { crm } from "../rpc";

type S = { id: number; name: string; members: number };

// The shared skill list members pick from (and add to). Tidy it: rename, merge duplicates ("Welding" + "welding mig"), delete junk.
export default function Skills({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<S[]>([]), [q, setQ] = useState("");
  const load = useCallback(() => crm<S[]>("skills").then(setRows, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const run = (p: Promise<unknown>) => p.then(load, (e) => alertDialog(e.message));
  return (
    <>
      <h1>Skills</h1>
      <p className="sub">Members add skills to this list from their own page. Rename, merge or remove them here.</p>
      <div className="bar"><input type="search" aria-label="Filter" placeholder="Filter skills" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card">
        {rows.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).map((s) => (
          <div className="row" key={s.id}>
            <span className="grow">{s.name}</span><span className="tag">{s.members} member{s.members === 1 ? "" : "s"}</span>
            {canEdit && <>
              <button onClick={async () => { const n = await promptDialog("Rename skill", s.name); if (n) run(crm("renameSkill", { id: s.id, name: n })); }}>Rename</button>
              <button onClick={async () => {
                const to = await promptDialog(`Merge “${s.name}” into which skill? Type its exact name.`);
                const t = rows.find((x) => x.name.toLowerCase() === to?.trim().toLowerCase());
                if (to === null) return;
                if (!t) return void alertDialog("No skill has that exact name.");
                if (await confirmDialog(`Move everyone from “${s.name}” to “${t.name}” and delete “${s.name}”?`, { ok: "Merge" })) run(crm("mergeSkill", { id: s.id, into: t.id }));
              }}>Merge…</button>
              <button style={{ color: "var(--bad)" }} onClick={async () => { if (await confirmDialog(`Delete “${s.name}”? It's removed from ${s.members} member${s.members === 1 ? "" : "s"}.`, { ok: "Delete", danger: true })) run(crm("deleteSkill", { id: s.id })); }}>Delete</button>
            </>}
          </div>
        ))}
        {!rows.length && <p className="sub">No skills yet. They appear as members list them.</p>}
      </div>
    </>
  );
}
