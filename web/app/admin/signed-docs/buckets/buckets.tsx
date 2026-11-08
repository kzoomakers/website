"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { board } from "../rpc";

export default function Buckets({ initial }: { initial: { id: number; name: string; n: number }[] }) {
  const [rows, setRows] = useState(initial), [name, setName] = useState(""), [msg, setMsg] = useState("");
  const run = async (op: string, args: Record<string, unknown>) => { setMsg(""); try { await board(op, args); setRows(await board("buckets")); } catch (e: any) { setMsg(e.message); } };
  return (
    <>
      <h1>Buckets</h1>
      <p className="sub">Folders for signed papers, like Board Resolutions or Meeting Minutes. Deleting a bucket keeps its papers; they just become unfiled.</p>
      <form className="bar" onSubmit={async (e) => { e.preventDefault(); await run("addBucket", { name }); setName(""); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New bucket name" maxLength={80} required /><button className="pri">Add bucket</button>
        {msg && <span role="alert" className="sub" style={{ margin: 0 }}>{msg}</span>}
      </form>
      <div className="card">
        {rows.map((b) => <div key={b.id} className="bar" style={{ justifyContent: "space-between" }}><span><strong>{b.name}</strong> <small>{b.n} paper{b.n === 1 ? "" : "s"}</small></span>
          <button onClick={async () => { if (await confirmDialog(`Delete the bucket "${b.name}"? Its papers are kept.`, { ok: "Delete", danger: true })) run("deleteBucket", { id: b.id }); }}>Delete</button></div>)}
        {!rows.length && <p className="sub">No buckets yet.</p>}
      </div>
    </>
  );
}
