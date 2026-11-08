"use client";
import { useMemo, useState } from "react";

type Item = { description: string; type: string };

// Searchable, sortable list of needed items with category filter buttons. Classes come from css/inventory.css and css/donations.css.
export function DonationNeeds({ items, statLabel }: { items: Item[]; statLabel: string }) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: keyof Item; dir: 1 | -1 } | null>(null);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => m.set(i.type, (m.get(i.type) ?? 0) + 1));
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  const ql = q.trim().toLowerCase();
  let rows = items.filter((i) => (cat === "all" || i.type === cat) && (!ql || (i.description + " " + i.type).toLowerCase().includes(ql)));
  if (sort) rows = [...rows].sort((a, b) => a[sort.col].toLowerCase().localeCompare(b[sort.col].toLowerCase()) * sort.dir);
  const th = (col: keyof Item, label: string) => (
    <th className={`sortable${sort?.col === col ? " sorted" : ""}`} onClick={() => setSort({ col, dir: sort?.col === col && sort.dir === 1 ? -1 : 1 })}>
      {label}<span className="sort-indicator">{sort?.col === col ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</span>
    </th>
  );
  return (
    <div className="row"><div className="col-12">
      <div className="inventory-stats"><div className="stat-card"><div className="stat-number">{rows.length}</div><div className="stat-label">{statLabel}</div></div></div>
      <div className="category-filter-container">
        <button className={`category-btn${cat === "all" ? " active" : ""}`} onClick={() => setCat("all")}>All Categories <span className="category-count">{items.length}</span></button>
        {cats.map(([n, c]) => <button key={n} className={`category-btn${cat === n ? " active" : ""}`} onClick={() => setCat(n)}>{n} <span className="category-count">{c}</span></button>)}
      </div>
      <div className="search-box-wrapper">
        <input type="text" className="search-input" placeholder="Search for tools, equipment, or supplies..." autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the list" />
        <span className="search-icon">🔍</span>
      </div>
      <div className="table-responsive"><table className="donation-table">
        <thead><tr>{th("description", "Item We Need")}{th("type", "Category")}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => <tr key={i}><td className="item-description">{r.description}</td><td className="item-category">{r.type}</td></tr>)
            : <tr><td colSpan={2} className="no-results">No items found in this category</td></tr>}
        </tbody>
      </table></div>
    </div></div>
  );
}
