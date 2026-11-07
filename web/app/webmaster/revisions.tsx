"use client";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { ago } from "./ago";
import { seqDiff } from "./diff";

export type Rev<T> = { id: number; at: string; actor: string; action: string; target: string; data: T };

// Revision list shared by the board and calendar screens: line diff against the previous revision, and revert.
export default function Revisions<T>({ api, lines, onRevert, reload }: { api: string; lines: (d: T) => string[]; onRevert: (r: Response) => void; reload: number }) {
  const [revs, setRevs] = useState<Rev<T>[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => { fetch(`${api}?history`).then((r) => r.json()).then(setRevs).catch(() => {}); }, [api, reload, n]);
  const revert = async (id: number) => {
    if (!(await confirmDialog(`Revert to revision #${id}? Unsaved edits here are lost.`, { ok: "Revert" }))) return;
    const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revert: id }) });
    if (r.ok) { onRevert(r); setN(n + 1); } else setErr(await r.text());
  };
  return (
    <>
      <h2>Revision history</h2>
      {err && <p className="err">{err}</p>}
      <div className="card">
        {revs.map((v, i) => {
          const d = seqDiff(revs[i + 1] ? lines(revs[i + 1].data) : [], lines(v.data)).filter((l) => l.t !== " ");
          return (
            <div key={v.id}><div className="row">
              <span className="grow">#{v.id} · {v.actor} {v.action.endsWith(".revert") && <span className="tag">reverted to {v.target.replace("revision ", "")}</span>}{v.action.endsWith(".import") && <span className="tag">initial</span>}</span>
              <span className="tag" title={new Date(v.at).toLocaleString()}>{ago(v.at)}</span>
              <button aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? "Hide changes" : "Changes"}</button>
              {i ? <button onClick={() => revert(v.id)}>Revert</button> : <span className="tag">current</span>}
            </div>
            {open === v.id && <div className="diff">{d.length ? d.map((l, j) => <div key={j} className={`dl d${l.t === "+" ? "a" : "r"}`}><span>{l.t}</span>{l.v}</div>) : <p className="sub">No changes from the previous revision.</p>}</div>}</div>
          );
        })}
        {!revs.length && <p className="sub">No saved revisions yet.</p>}
      </div>
    </>
  );
}
