"use client";
import { useMemo, useState } from "react";
import { confirmDialog, promptDialog } from "@/components/dialog";

export type Need = { description: string; type: string };

// Manager for the "items we need" list: pick a category on the left, then add, rename, recategorise or remove items on the right.
export default function NeedsEditor({ items, set }: { items: Need[]; set: (l: Need[]) => void }) {
  const [cat, setCat] = useState<string | null>(null); // null = all categories
  const [extra, setExtra] = useState<string[]>([]);    // new categories that have no items yet
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const [draft, setDraft] = useState("");
  const [bulk, setBulk] = useState("");
  const [note, setNote] = useState<{ msg: string; undo?: () => void } | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>(extra.map((c) => [c, 0]));
    items.forEach((i) => m.set(i.type, (m.get(i.type) ?? 0) + 1));
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, extra]);
  const names = counts.map((c) => c[0]);
  const target = cat ?? names[0] ?? ""; // where "Add" puts new items
  const ql = q.trim().toLowerCase();
  const rows = items.map((it, i) => ({ it, i })).filter(({ it }) => (cat === null || it.type === cat) && (!ql || (it.description + " " + it.type).toLowerCase().includes(ql)));
  const has = (d: string) => items.some((i) => i.description.trim().toLowerCase() === d.trim().toLowerCase());
  const edit = (i: number, p: Partial<Need>) => set(items.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const add = () => {
    const d = draft.trim();
    if (!d || !target) return;
    if (has(d)) return setNote({ msg: `“${d}” is already on the list.` });
    set([{ description: d, type: target }, ...items]); setDraft(""); setNote(null);
  };
  const addMany = () => {
    const lines = [...new Set(bulk.split("\n").map((l) => l.trim()).filter(Boolean))].filter((l) => !has(l));
    if (!lines.length || !target) return setNote({ msg: "Nothing new to add." });
    set([...lines.map((description) => ({ description, type: target })), ...items]); setBulk(""); setNote({ msg: `Added ${lines.length} item${lines.length > 1 ? "s" : ""} to ${target}.` });
  };
  const remove = (i: number) => {
    const gone = items[i], before = items;
    set(items.filter((_, j) => j !== i));
    setNote({ msg: `Removed “${gone.description}”.`, undo: () => { set(before); setNote(null); } });
  };
  const newCat = async () => {
    const n = (await promptDialog("Name of the new category:"))?.trim();
    if (!n) return;
    if (!names.includes(n)) setExtra([...extra, n]);
    setCat(n);
  };
  const rename = async () => {
    const n = (await promptDialog(`Rename “${cat}” to:`, cat!))?.trim();
    if (!n || n === cat) return;
    if (names.includes(n) && !(await confirmDialog(`“${n}” already exists. Move all items from “${cat}” into it?`, { ok: "Merge" }))) return;
    set(items.map((i) => (i.type === cat ? { ...i, type: n } : i)));
    setExtra(extra.filter((c) => c !== cat).concat(extra.includes(cat!) ? [n] : []));
    setCat(n);
  };
  const delCat = async () => {
    const n = counts.find((c) => c[0] === cat)?.[1] ?? 0;
    if (!(await confirmDialog(n ? `Delete “${cat}” and its ${n} item${n > 1 ? "s" : ""}? You can bring them back from Revision history.` : `Delete the empty category “${cat}”?`, { ok: "Delete", danger: true }))) return;
    set(items.filter((i) => i.type !== cat)); setExtra(extra.filter((c) => c !== cat)); setCat(null);
  };

  return (
    <div className="needs">
      <div className="needs-stats"><b>{items.length}</b> items in <b>{names.length}</b> categories</div>
      <div className="needs-grid">
        <nav className="needs-cats" aria-label="Categories">
          <button className={`ncat${cat === null ? " on" : ""}`} onClick={() => { setCat(null); setLimit(100); }}>All categories <span>{items.length}</span></button>
          {counts.map(([n, c]) => <button key={n} className={`ncat${cat === n ? " on" : ""}`} onClick={() => { setCat(n); setLimit(100); }}>{n} <span>{c}</span></button>)}
          <button className="ncat nnew" onClick={newCat}>＋ New category</button>
        </nav>
        <div>
          <div className="needs-head">
            <h3>{cat ?? "All categories"}</h3>
            {cat && <><button onClick={rename}>✏️ Rename</button><button className="danger" onClick={delCat}>🗑 Delete category</button></>}
          </div>
          <div className="needs-add">
            <input aria-label="New item" placeholder={target ? `Add an item to ${target}… then press Enter` : "Create a category first"} value={draft} disabled={!target}
              onChange={(e) => { setDraft(e.target.value); setNote(null); }} onKeyDown={(e) => e.key === "Enter" && add()} />
            {cat === null && <select aria-label="Category for the new item" value={target} onChange={(e) => setCat(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select>}
            <button className="pri" disabled={!draft.trim() || !target} onClick={add}>Add</button>
          </div>
          <details className="needs-bulk"><summary>Add many at once</summary>
            <textarea rows={5} placeholder={"One item per line, e.g.\nBench vise\nCordless drill"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
            <button disabled={!bulk.trim() || !target} onClick={addMany}>Add these to {target || "…"}</button>
          </details>
          {note && <p className="needs-note" role="status">{note.msg} {note.undo && <button onClick={note.undo}>↩ Undo</button>}</p>}
          <input className="needs-search" type="search" aria-label="Search items" placeholder="🔍 Search the list…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} />
          <div className="needs-rows">
            {rows.slice(0, limit).map(({ it, i }) => (
              <div className="nrow" key={i}>
                <input aria-label="Item" value={it.description} onChange={(e) => edit(i, { description: e.target.value })} />
                {(cat === null || ql) && <select aria-label="Category" value={it.type} onChange={(e) => edit(i, { type: e.target.value })}>{names.map((n) => <option key={n}>{n}</option>)}</select>}
                <button className="nx" aria-label={`Remove ${it.description}`} title="Remove" onClick={() => remove(i)}>✕</button>
              </div>
            ))}
            {!rows.length && <p className="sub">{ql ? "Nothing matches your search." : "No items here yet — add the first one above."}</p>}
            {rows.length > limit && <button onClick={() => setLimit(limit + 100)}>Show {Math.min(100, rows.length - limit)} more ({rows.length - limit} hidden)</button>}
          </div>
          {cat !== null && !ql && <p className="sub">Tip: to move an item to another category, search for it with “All categories” selected and change its category.</p>}
        </div>
      </div>
    </div>
  );
}
