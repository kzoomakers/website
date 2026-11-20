"use client";
import Notice from "@/components/notice";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { board } from "../rpc";

export default function Buckets({ initial }: { initial: { id: number; name: string; n: number }[] }) {
  const [rows, setRows] = useState(initial), [name, setName] = useState(""), [msg, setMsg] = useState("");
  const run = async (op: string, args: Record<string, unknown>) => { setMsg(""); try { await board(op, args); setRows(await board("buckets")); } catch (e: any) { setMsg(e.message); } };
  return (
    <>
      <h1>Folders</h1>
      <p className="sub">Folders for signed documents, like Board Resolutions or Meeting Minutes. Deleting a folder keeps its documents; they just become unfiled.</p>
      <form className="bar" onSubmit={async (e) => { e.preventDefault(); await run("addBucket", { name }); setName(""); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder name" maxLength={80} required /><button className="pri">Add folder</button>
        {msg && <Notice kind="error">{msg}</Notice>}
      </form>
      <div className="card">
        {rows.map((b) => <div key={b.id} className="bar" style={{ justifyContent: "space-between" }}><span><strong>{b.name}</strong> <small>{b.n} document{b.n === 1 ? "" : "s"}</small></span>
          <button onClick={async () => { if (await confirmDialog(`Delete the folder "${b.name}"? Its documents are kept.`, { ok: "Delete", danger: true })) run("deleteBucket", { id: b.id }); }}>Delete</button></div>)}
        {!rows.length && <p className="sub">No folders yet.</p>}
      </div>
    </>
  );
}
