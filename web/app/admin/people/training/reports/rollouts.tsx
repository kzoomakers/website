"use client";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { training } from "../rpc";

type R = { id: number; deadline: string; created_by: string; undone_at: string | null; guard_at: string | null; lapse_ok: boolean; note: string; rev_no: number; title: string; tool: string; pending: number; satisfied: number; lapsed: number; exempt: number };
type M = { user_id: number; tool_id: number; status: string; name: string; email: string; tool: string };

function Detail({ r, canRollout, canOverride, reload }: { r: R; canRollout: boolean; canOverride: boolean; reload: () => void }) {
  const [ms, setMs] = useState<M[] | null>(null);
  const load = useCallback(() => training<M[]>("rolloutMembers", { id: r.id }).then(setMs, (e) => alertDialog(e.message)), [r.id]);
  useEffect(() => { load(); }, [load]);
  const act = (p: Promise<unknown>) => p.then(() => { load(); reload(); }, (e) => alertDialog(e.message));
  return (
    <div style={{ marginTop: 8 }}>
      {ms === null ? <p className="sub">Loading…</p> : ms.map((m) => (
        <div className="row" key={`${m.user_id}:${m.tool_id}`}>
          <span className="grow"><b>{m.name}</b> <span className="sub" style={{ margin: 0 }}>{m.tool}</span></span><span className="tag">{m.status}</span>
          {!r.undone_at && ["pending", "lapsed"].includes(m.status) && <>
            {canRollout && <button onClick={async () => { const d = await promptDialog("New deadline for this person (YYYY-MM-DD)", "", { ok: "Next" }); if (!d) return; const why = await promptDialog("Why?", "", { ok: "Extend" }); if (why !== null) act(training("memberOverride", { id: r.id, user: m.user_id, tool: m.tool_id, how: "extend", date: d, reason: why })); }}>Extend</button>}
            {canOverride && <button onClick={async () => { const why = await promptDialog(`Let ${m.name} off this re-pass? Why?`, "", { ok: "Exempt" }); if (why !== null) act(training("memberOverride", { id: r.id, user: m.user_id, tool: m.tool_id, how: "exempt", reason: why })); }}>Exempt</button>}
          </>}
        </div>
      ))}
    </div>
  );
}

export default function Rollouts({ canRollout, canOverride }: { canRollout: boolean; canOverride: boolean }) {
  const [rows, setRows] = useState<R[] | null>(null), [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => training<R[]>("rollouts").then(setRows, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = (p: Promise<unknown>) => p.then(load, (e) => alertDialog(e.message));
  return (
    <>
      <h1>Training reports</h1>
      <h2>Re-pass rollouts</h2>
      <p className="sub">Started when a major test revision is published with a deadline. People who pass the new test by the deadline keep their authorization; the rest lose it until they pass. More reports come later.</p>
      <div className="card">{rows === null ? <p className="sub">Loading…</p> : !rows.length ? <p className="sub">No rollouts yet.</p> : rows.map((r) => {
        const total = r.pending + r.satisfied + r.lapsed;
        return (
          <div className="row" key={r.id} style={{ display: "block", opacity: r.undone_at ? 0.6 : 1 }}>
            <b>{r.tool}</b> <span className="sub" style={{ margin: 0 }}>revision {r.rev_no}, by {r.deadline}{r.undone_at ? " (undone)" : ""}</span>
            <progress max={total || 1} value={r.satisfied} style={{ width: 160, margin: "0 8px" }} />
            <span className="tag">{r.satisfied} passed</span><span className="tag">{r.pending} waiting</span>{r.lapsed > 0 && <span className="tag" style={{ color: "#b00020" }}>{r.lapsed} lapsed</span>}{r.exempt > 0 && <span className="tag">{r.exempt} exempt</span>}
            {r.guard_at && !r.lapse_ok && !r.undone_at && <span className="qe-warn"> Held back: this would lapse more than half the people. {canRollout ? "Confirm below, extend, or undo." : "A lead must confirm."}</span>}
            <div className="bar">
              <button onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide people" : "People"}</button>
              {canRollout && !r.undone_at && <>
                <button onClick={async () => { const d = await promptDialog("New deadline for everyone still owing a re-pass (YYYY-MM-DD). People already lapsed get their authorization back.", r.deadline, { ok: "Extend" }); if (d) act(training("extendRollout", { id: r.id, deadline: d })); }}>Extend everyone</button>
                {r.guard_at && !r.lapse_ok && <button onClick={async () => { if (await confirmDialog(`Lapse ${r.pending} people at the next check?`, { ok: "Confirm" })) act(training("confirmLapse", { id: r.id })); }}>Confirm lapse</button>}
                <button onClick={async () => { if (await confirmDialog("Undo this rollout? Nobody will owe a re-pass and anyone lapsed is restored.", { ok: "Undo rollout", danger: true } as any)) act(training("undoRollout", { id: r.id })); }}>Undo rollout</button>
              </>}
            </div>
            {open === r.id && <Detail r={r} canRollout={canRollout} canOverride={canOverride} reload={load} />}
          </div>
        );
      })}</div>
    </>
  );
}
