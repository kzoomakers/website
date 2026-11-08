"use client";
import Notice from "@/components/notice";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DisableButton from "../disable-button";
import { confirmDialog } from "@/components/dialog";

type Level = "read" | "write";
type Row = { id: number; email: string; name: string; perms: Record<string, Level>; founder: boolean; disabled: boolean };
const COLS = [["webmaster", "Website"], ["mail", "Email"], ["blog", "Blog"], ["forms", "Forms"], ["crm", "CRM"], ["board", "Signatures"], ["tours", "Tours"], ["chores", "Chores"], ["admin", "Admin"]] as const;

// Who can open each top-level admin page: none, view only, or view + change. Search finds ordinary site accounts to grant access to.
export default function Users({ initial, canEdit }: { initial: Row[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial), [q, setQ] = useState(""), [err, setErr] = useState(""), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => fetch("/api/webmaster/users?q=" + encodeURIComponent(q)).then((r) => (r.ok ? r.json() : Promise.reject())).then(setRows, () => setErr("Search failed.")), 250);
    return () => clearTimeout(t);
  }, [q]);
  const set = async (u: Row, section: string, v: string) => {
    setErr("");
    const level = v || null;
    const r = await fetch("/api/webmaster/users", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id, section, level }) });
    if (!r.ok) return setErr(await r.text());
    setRows((rs) => rs.map((x) => { if (x.id !== u.id) return x; const perms = { ...x.perms }; if (level) perms[section] = level as Level; else delete perms[section]; return { ...x, perms }; }));
  };
  const del = async (u: Row) => {
    if (!(await confirmDialog(`Are you sure you want to delete ${u.name} (${u.email})?\n\nThis permanently removes their account, profile, photo ID, comments, emergency contacts and access. Their signed waiver PDFs are kept for the record. This cannot be undone.`, { ok: "Delete account", danger: true }))) return;
    setErr("");
    const r = await fetch(`/api/webmaster/users/${u.id}`, { method: "DELETE" });
    if (!r.ok) return setErr(await r.text());
    setRows((rs) => rs.filter((x) => x.id !== u.id));
  };
  return (
    <>
        <h1>Access</h1>
        <p className="sub">Click a name to open them in CRM. Choose who can open each admin page. <strong>View only</strong> lets someone look but not change; <strong>Can edit</strong> lets them change things. Admin + Can edit is a full administrator who can also grant access. Anyone who has registered on the site can be found below; the first person to register is made the founding administrator, whose access can never be changed. At least 3 administrators must always remain.</p>
        <div className="bar"><input type="search" aria-label="Search people" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 280 }} /></div>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={{ textAlign: "left", padding: "10px 8px" }}>Person</th>{COLS.map(([, l]) => <th key={l} style={{ textAlign: "left", padding: "10px 8px" }}>{l}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px" }}><div style={{ fontWeight: 600 }}><Link href={`/admin/crm/people/${u.id}`} title="Open in CRM">{u.name}</Link>{u.disabled && <span className="tag" style={{ color: "var(--bad)" }}>Disabled</span>}{u.founder && <span className="tag" title="The first person to register. Their access can never be changed.">Founder</span>}</div><div className="sub" style={{ margin: 0, fontSize: 12 }}>{u.email}</div></td>
                  {COLS.map(([s, l]) => (
                    <td key={s} style={{ padding: "8px" }}>
                      <select aria-label={`${u.name}: ${l}`} disabled={!canEdit || u.founder} value={u.perms[s] ?? ""} onChange={(e) => set(u, s, e.target.value)}>
                        <option value="">No access</option><option value="read">View only</option><option value="write">Can edit</option>
                      </select>
                    </td>
                  ))}
                  <td style={{ padding: "8px" }}>{canEdit && !u.founder && <DisableButton id={u.id} name={u.name} disabled={u.disabled} onChange={(d) => setRows((rs) => rs.map((x) => (x.id === u.id ? { ...x, disabled: d } : x)))} />}{canEdit && !u.founder && <button type="button" onClick={() => del(u)} style={{ marginLeft: 6, color: "var(--bad)" }}>Delete</button>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={COLS.length + 2} className="sub" style={{ padding: 16 }}>No one found.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 16 }}>Some administrators are set up outside this list; they always have full access and don't appear here. You can't change your own Admin access.</p>
    </>
  );
}
