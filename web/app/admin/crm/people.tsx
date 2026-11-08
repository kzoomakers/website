"use client";
import Notice from "@/components/notice";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DisableButton from "../disable-button";
import type { Person } from "@/lib/profiles";

// Everyone with a site account: search by name, email, phone, card number or QuickBooks id; open someone for their details and emergency contacts.
export default function People({ initial, canEdit }: { initial: Person[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial), [q, setQ] = useState(""), [err, setErr] = useState(""), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => fetch("/api/webmaster/people?q=" + encodeURIComponent(q)).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setRows(d); setErr(""); }, () => setErr("Search failed.")), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <h1>People</h1>
      <p className="sub">Everyone who has registered on the site. Click a name for their details, emergency contacts and account actions.</p>
      <div className="bar"><input type="search" aria-label="Search people" placeholder="Search name, email, phone, card or QuickBooks ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 320 }} /></div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="card">
        {rows.map((p) => (
          <div className="row" key={p.id}>
            <Link href={`/admin/crm/people/${p.id}`}>{p.name}</Link>
            <span className="tag">{p.email}</span>
            {p.phone && <span className="tag">{p.phone}</span>}
            {p.card && <span className="tag">card {p.card}</span>}
            {p.disabled && <span className="tag" style={{ color: "var(--bad)" }}>disabled</span>}
            {!p.verified && <span className="tag">unverified</span>}
            {!p.contacts && <span className="tag" style={{ color: "var(--bad)" }}>no emergency contact</span>}
            {canEdit && <span style={{ marginLeft: "auto" }}><DisableButton id={p.id} name={p.name} disabled={p.disabled} onChange={(d) => setRows((rs) => rs.map((x) => (x.id === p.id ? { ...x, disabled: d } : x)))} /></span>}
          </div>
        ))}
        {!rows.length && <p className="sub">No one found.</p>}
      </div>
    </>
  );
}
