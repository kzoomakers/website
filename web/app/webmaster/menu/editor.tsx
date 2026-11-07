"use client";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { ago } from "../ago";
import { diffMenus } from "../diff";
import type { MenuItem } from "@/lib/menu";

type Setter = (l: MenuItem[]) => void;

// Edits one level of the tree; items with a `items` array are dropdowns, others are links.
function List({ list, set, depth = 0 }: { list: MenuItem[]; set: Setter; depth?: number }) {
  const upd = (i: number, p: Partial<MenuItem>) => set(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => {
    const l = [...list]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); set(l);
  };
  return (
    <ul className="tree">
      {list.map((m, i) => (
        <li key={i}><div className="item">
          <input value={m.label} placeholder="Label" onChange={(e) => upd(i, { label: e.target.value })} />{" "}
          {m.items ? <span className="tag">▾ dropdown</span> : <input value={m.href ?? ""} placeholder="/page" onChange={(e) => upd(i, { href: e.target.value })} />}{" "}
          <button disabled={!i} onClick={() => move(i, -1)}>↑</button>
          <button disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>{" "}
          {depth < 2 && (m.items
            ? <button onClick={async () => !m.items!.length || (await confirmDialog("Turn into a plain link and drop its sub-items?", { ok: "Make link", danger: true })) ? upd(i, { items: undefined, href: "" }) : 0}>make link</button>
            : <button onClick={() => upd(i, { items: [], href: undefined })}>make dropdown</button>)}{" "}
          <button className="danger" aria-label="Remove" onClick={async () => (await confirmDialog(`Remove ${m.label || "item"}?`, { ok: "Remove", danger: true })) && set(list.filter((_, j) => j !== i))}>✕</button></div>
          {m.items && <List list={m.items} depth={depth + 1} set={(items) => upd(i, { items })} />}
        </li>
      ))}
      <li><button onClick={() => set([...list, { label: "", href: "" }])} style={{ marginTop: 6 }}>+ add item</button></li>
    </ul>
  );
}

type Rev = { id: number; at: string; actor: string; action: string; target: string; data: MenuItem[] };

function Diff({ before, after }: { before: MenuItem[]; after: MenuItem[] }) {
  const d = diffMenus(before, after);
  const add = d.filter((l) => l.t === "+").length, del = d.filter((l) => l.t === "-").length;
  if (!add && !del) return <p className="sub">No changes from the previous revision.</p>;
  return (
    <div className="diff" aria-label="Changes from the previous revision">
      <div className="diffsum"><span className="ok">+{add}</span> <span className="err">−{del}</span> vs previous revision</div>
      {d.map((l, i) => <div key={i} className={`dl d${l.t === "+" ? "a" : l.t === "-" ? "r" : "n"}`}><span>{l.t === " " ? "" : l.t}</span>{l.text}</div>)}
    </div>
  );
}

export default function MenuEditor({ initial }: { initial: MenuItem[] }) {
  const [menu, setMenu] = useState(initial);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [revs, setRevs] = useState<Rev[]>([]);
  const loadRevs = () => fetch("/api/webmaster/menu?history").then((r) => r.json()).then(setRevs).catch(() => {});
  useEffect(() => { loadRevs(); }, []);
  const save = async () => {
    const r = await fetch("/api/webmaster/menu", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(menu) });
    setMsg(r.ok ? "Saved" : await r.text());
    loadRevs();
  };
  const revert = async (id: number) => {
    if (!(await confirmDialog(`Revert the menu to revision #${id}? Unsaved edits here are lost.`, { ok: "Revert" }))) return;
    const r = await fetch("/api/webmaster/menu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revert: id }) });
    if (r.ok) { setMenu(await r.json()); setMsg("Saved"); } else setMsg(await r.text());
    loadRevs();
  };
  return (
    <>
      <h1>Menu</h1>
      <p className="sub">The site navigation. Top-level items can be links or dropdowns.</p>
      <div className="bar"><button className="pri" onClick={save}>Save menu</button><span className={msg === "Saved" ? "toast" : "err"} role="status">{msg}</span></div>
      <div className="card"><List list={menu} set={(m) => { setMsg(""); setMenu(m); }} /></div>
      <h2>Revision history</h2>
      <div className="card">
        {revs.map((v, i) => (
          <div key={v.id}><div className="row">
            <span className="grow">#{v.id} · {v.actor} {v.action === "menu.revert" && <span className="tag">reverted to {v.target.replace("revision ", "")}</span>}</span>
            <span className="tag" title={new Date(v.at).toLocaleString()}>{ago(v.at)}</span>
            <button aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? "Hide changes" : "Changes"}</button>
            {i ? <button onClick={() => revert(v.id)}>Revert</button> : <span className="tag">current</span>}
          </div>
          {open === v.id && <Diff before={revs[i + 1]?.data ?? []} after={v.data} />}</div>
        ))}
        {!revs.length && <p className="sub">No saved revisions yet.</p>}
      </div>
    </>
  );
}
