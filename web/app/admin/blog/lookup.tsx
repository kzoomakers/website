"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { ImagePick } from "./media-picker";

type Row = { id?: number; [k: string]: any };
type Field = { key: string; label: string; area?: boolean; image?: boolean };

// Shared list editor for authors and categories: rows are edited in place and saved one at a time.
export default function Lookup({ kind, initial, fields, noun }: { kind: "author" | "category"; initial: Row[]; fields: Field[]; noun: string }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [msg, setMsg] = useState("");
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, ""]));
  const upd = (i: number, p: Row) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = async (i: number) => {
    const r = await fetch("/api/webmaster/blog-meta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ...rows[i] }) });
    if (!r.ok) return setMsg(await r.text());
    upd(i, await r.json()); setMsg("Saved.");
  };
  const del = async (i: number) => {
    const r = rows[i];
    if (r.id && !(await confirmDialog(`Delete ${r.name}? Posts keep existing but lose this ${noun}.`, { ok: "Delete", danger: true }))) return;
    if (r.id) await fetch(`/api/webmaster/blog-meta?kind=${kind}&id=${r.id}`, { method: "DELETE" });
    setRows(rows.filter((_, j) => j !== i));
  };
  return (
    <>
      <h1>{noun[0].toUpperCase() + noun.slice(1)}s</h1>
      {msg && <p className="sub">{msg}</p>}
      {rows.map((r, i) => (
        <div className="card" key={r.id ?? "new" + i} style={{ padding: 12, marginTop: 8, display: "grid", gap: 6 }}>
          {fields.map((f) => f.image ? <ImagePick key={f.key} value={r[f.key]} onChange={(v) => upd(i, { [f.key]: v })} />
            : f.area ? <textarea key={f.key} rows={3} aria-label={f.label} placeholder={f.label} value={r[f.key]} onChange={(e) => upd(i, { [f.key]: e.target.value })} />
            : <input key={f.key} aria-label={f.label} placeholder={f.label} value={r[f.key]} onChange={(e) => upd(i, { [f.key]: e.target.value })} />)}
          <div className="bar" style={{ margin: 0 }}><button className="pri" onClick={() => save(i)}>Save</button><button className="danger" onClick={() => del(i)}>Delete</button></div>
        </div>
      ))}
      <div className="bar" style={{ marginTop: 8 }}><button onClick={() => setRows([...rows, blank()])}>+ add {noun}</button></div>
    </>
  );
}
