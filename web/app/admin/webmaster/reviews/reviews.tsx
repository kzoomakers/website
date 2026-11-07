"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Review } from "@/lib/reviews";

type Tab = Review["status"];
const TABS: [Tab, string][] = [["pending", "Waiting"], ["approved", "On the homepage"], ["rejected", "Rejected"]];
const api = (method: string, body?: unknown, q = "") => fetch("/api/webmaster/reviews" + q, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export default function Reviews({ initial, tab: t0, counts: n0 }: { initial: Review[]; tab: Tab; counts: Record<string, number> }) {
  const [tab, setTab] = useState<Tab>(t0), [items, setItems] = useState(initial), [n, setN] = useState(n0), [msg, setMsg] = useState("");
  const load = async (t: Tab) => { setTab(t); const r = await (await fetch(`/api/webmaster/reviews?status=${t}`)).json(); setItems(r.reviews); setN(r.counts); };
  const edit = (id: number, k: "name" | "role" | "text", v: string) => setItems(items.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const act = async (r: Review, action: "save" | "approve" | "reject" | "restore") => {
    const res = await api("PATCH", { id: r.id, action, name: r.name, role: r.role, text: r.text });
    if (!res.ok) return setMsg(await res.text());
    setMsg(action === "approve" ? "Added to the homepage roster." : action === "save" ? "Saved." : "");
    if (action !== "save") load(tab);
  };
  const del = async (r: Review) => {
    if (!(await confirmDialog("Delete this submission for good?", { ok: "Delete", danger: true }))) return;
    await api("DELETE", undefined, `?id=${r.id}`); load(tab);
  };
  return (
    <>
      <h1>Reviews</h1>
      <p className="sub">Signed-in visitors can submit a review from the homepage. Edit the wording if you like, then add it to the homepage roster or reject it.</p>
      <nav className="bar" aria-label="Review status">
        {TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} style={tab === k ? { fontWeight: 700 } : undefined} onClick={() => load(k)}>{l} ({n[k] ?? 0})</button>)}
        {msg && <span className="sub" role="status" style={{ margin: 0 }}>{msg}</span>}
      </nav>
      <div className="card">
        {items.map((r) => (
          <div key={r.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)", display: "grid", gap: 8 }}>
            <div><span className="tag">{r.email}</span> <span className="tag">{new Date(r.created_at).toLocaleString()}</span> {r.reason && <span className="tag" title="Why the filter rejected it">{r.reason}</span>}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {r.photo && <img src={r.photo} alt="" width={48} height={48} style={{ borderRadius: "50%", objectFit: "cover" }} />}
              <input aria-label="Name" value={r.name} maxLength={80} onChange={(e) => edit(r.id, "name", e.target.value)} placeholder="Name" />
              <input aria-label="Role" value={r.role} maxLength={60} onChange={(e) => edit(r.id, "role", e.target.value)} placeholder="Role, e.g. Makerspace Member" />
            </div>
            <textarea aria-label="Review" rows={3} value={r.text} maxLength={800} onChange={(e) => edit(r.id, "text", e.target.value)} />
            <div>
              {tab !== "approved" && <button className="pri" onClick={() => act(r, "approve")}>Add to roster</button>}{" "}
              <button onClick={() => act(r, "save")}>Save edits</button>{" "}
              {tab === "pending" && <button onClick={() => act(r, "reject")}>Reject</button>}
              {tab === "rejected" && <button onClick={() => act(r, "restore")}>Move back to waiting</button>}{" "}
              <button className="danger" onClick={() => del(r)}>Delete</button>
            </div>
          </div>
        ))}
        {!items.length && <p className="sub">Nothing here.</p>}
      </div>
    </>
  );
}
