"use client";
import { useState } from "react";
import Notice from "@/components/notice";
import type { MembershipClass } from "@/lib/membership";

type Row = { name: string; price: string; per: string; normal: string; offer: string; blurb: string; note: string; features: string };
const toRow = (c: MembershipClass): Row => ({ name: c.name, price: String(c.price), per: c.per, normal: c.normal ?? "", offer: c.offer ?? "", blurb: c.blurb ?? "", note: c.note ?? "", features: c.features ?? "" });

// The membership classes, their fees and the text on the Pricing page. Staff pick a member's class when they approve or activate them.
export default function MembershipClasses({ initial }: { initial: MembershipClass[] }) {
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState(false);
  const edit = (i: number, k: keyof Row, v: string) => { setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setOk(false); };
  const remove = (i: number) => { setRows(rows.filter((_, j) => j !== i)); setOk(false); };
  const save = async () => {
    setBusy(true); setMsg(""); setOk(false);
    const r = await fetch("/api/webmaster/membership-classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ classes: rows }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { const saved: MembershipClass[] = await r.json(); setRows(saved.map(toRow)); setOk(true); }
    else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  return (
    <div style={{ maxWidth: 680, marginTop: 32 }}>
      <h2>Membership classes</h2>
      <p className="sub">What people can join and what each costs. When you approve or activate someone, you pick their class. Removing a class stops offering it; members already in it keep it.</p>
      <Notice kind="error">{msg}</Notice>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input aria-label="Class name" placeholder="Name" maxLength={80} value={r.name} onChange={(e) => edit(i, "name", e.target.value)} style={{ flex: "2 1 200px" }} />
          <span>$</span>
          <input aria-label="Fee" type="number" min={0} max={100000} step="0.01" value={r.price} onChange={(e) => edit(i, "price", e.target.value)} style={{ width: 110 }} />
          <span>per</span>
          <input aria-label="Per" placeholder="month" maxLength={30} value={r.per} onChange={(e) => edit(i, "per", e.target.value)} style={{ width: 110 }} />
          <button type="button" onClick={() => remove(i)}>Remove</button>
          <details style={{ flexBasis: "100%" }}>
            <summary>Pricing page text</summary>
            <div style={{ display: "grid", gap: 8, padding: "8px 0" }}>
              <label>Normal price label<input maxLength={80} placeholder="Normally $45/m" value={r.normal} onChange={(e) => edit(i, "normal", e.target.value)} /></label>
              <label>Offer badge<input maxLength={80} placeholder="Limited Time Price!" value={r.offer} onChange={(e) => edit(i, "offer", e.target.value)} /></label>
              <label>Short description<textarea rows={2} maxLength={500} value={r.blurb} onChange={(e) => edit(i, "blurb", e.target.value)} /></label>
              <label>Requirement note<input maxLength={200} placeholder="A Membership is Required" value={r.note} onChange={(e) => edit(i, "note", e.target.value)} /></label>
              <label>Features (one per line; wrap in **stars** for bold)<textarea rows={5} maxLength={2000} value={r.features} onChange={(e) => edit(i, "features", e.target.value)} /></label>
            </div>
          </details>
        </div>
      ))}
      {!rows.length && <p className="sub">No classes yet. Add one before approving members.</p>}
      <div className="bar">
        <button type="button" onClick={() => { setRows([...rows, { name: "", price: "0", per: "month", normal: "", offer: "", blurb: "", note: "", features: "" }]); setOk(false); }}>Add class</button>
        <button className="pri" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
      {ok && <p className="ok" role="status">✓ Saved</p>}
    </div>
  );
}
