"use client";
import Notice from "@/components/notice";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DisableButton from "../disable-button";
import type { Person } from "@/lib/profiles";
import "./people.css";

type Col = { key: string; label: string; sort?: string; on: boolean };
const COLS: Col[] = [
  { key: "name", label: "Name", sort: "name", on: true }, { key: "email", label: "Email", sort: "email", on: true }, { key: "levels", label: "Membership", on: true }, { key: "tools", label: "Tools", on: true },
  { key: "approval", label: "Status", sort: "approval", on: true }, { key: "joined", label: "Joined", sort: "joined", on: true }, { key: "card", label: "Card", sort: "card", on: false },
  { key: "contacts", label: "Emergency contacts", sort: "contacts", on: false }, { key: "waiver", label: "Waiver", on: false }];
const FLAGS: [string, string][] = [["", "Everyone"], ["no_contacts", "No emergency contact"], ["unverified", "Email not verified"], ["no_waiver", "Waiver not signed"], ["no_roster", "No roster photo"], ["no_membership", "No membership"], ["no_card", "No access card"]];
const KEY = "crm.people.cols", DELAY = 500;

// Everyone with a site account. Built for thousands: search as you type (after a half-second pause), filter, sort any column, choose columns, page through, export.
export default function People({ initial, levels, canEdit }: { initial: { rows: Person[]; total: number }; levels: string[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial.rows), [total, setTotal] = useState(initial.total), [q, setQ] = useState(""), [dq, setDq] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [sort, setSort] = useState("joined"), [dir, setDir] = useState("desc"), [status, setStatus] = useState(""), [approval, setApproval] = useState(""), [level, setLevel] = useState(""), [flag, setFlag] = useState("");
  const [on, setOn] = useState<string[]>(COLS.filter((c) => c.on).map((c) => c.key)), seq = useRef(0), first = useRef(true);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (Array.isArray(s)) setOn(s); } catch {} }, []);
  useEffect(() => { const t = setTimeout(() => setDq(q), DELAY); return () => clearTimeout(t); }, [q]);
  const qs = (offset = 0) => new URLSearchParams({ q: dq, sort, dir, status, approval, level, flag, offset: String(offset) });
  const load = async (more: boolean) => {
    const my = ++seq.current;
    setBusy(true);
    const r = await fetch("/api/webmaster/people?" + qs(more ? rows.length : 0)).then((x) => (x.ok ? x.json() : Promise.reject()), () => Promise.reject()).catch(() => null);
    if (my !== seq.current) return; // a newer search is running; drop this answer
    setBusy(false);
    if (!r) return setErr("Search failed. Try again.");
    setErr(""); setTotal(r.total); setRows(more ? [...rows, ...r.rows] : r.rows);
  };
  useEffect(() => { if (first.current) { first.current = false; return; } load(false); }, [dq, sort, dir, status, approval, level, flag]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k: string) => { const n = on.includes(k) ? on.filter((x) => x !== k) : [...on, k]; setOn(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} };
  const pick = (s: string) => { if (s === sort) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(s); setDir(s === "joined" ? "desc" : "asc"); } };
  const filtered = !!(q || status || approval || level || flag);
  const reset = () => { setQ(""); setDq(""); setStatus(""); setApproval(""); setLevel(""); setFlag(""); };
  const cols = COLS.filter((c) => on.includes(c.key));
  const cell = (p: Person, k: string) => ({
    email: <span className="tag">{p.email}</span>,
    levels: p.levels.length ? p.levels.map((l) => <span className="chip" key={l}>{l}</span>) : <span className="sub">none</span>,
    approval: <>{p.disabled ? <span className="chip bad">disabled</span> : p.approval === "approved" ? <span className="chip ok">active</span> : <span className="chip warn">{p.approval}</span>}{!p.verified && <span className="chip">unverified</span>}</>,
    joined: <span className="tag">{new Date(p.joined).toLocaleDateString([], { dateStyle: "medium" })}</span>,
    card: p.card || <span className="sub">–</span>,
    contacts: p.contacts || <span style={{ color: "var(--bad)" }}>none</span>,
    tools: p.tools.length ? <span title={p.tools.join(", ")}>{p.tools.length === 1 ? p.tools[0] : `${p.tools.length} tools`}</span> : <span className="sub">–</span>,
    waiver: p.waiver ? "✓" : <span className="sub">–</span>,
  } as Record<string, React.ReactNode>)[k];
  return (
    <>
      <h1>People</h1>
      <p className="sub">Everyone who has registered on the site. Click a name for their details, emergency contacts and account actions.</p>
      <div className="bar pl-bar">
        <input type="search" aria-label="Search people" placeholder="Search name, email, card or QuickBooks ID (several words narrow it down)" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 320px", minWidth: 240 }} />
        <select aria-label="Account" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any account</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
        <select aria-label="Sign-up status" value={approval} onChange={(e) => setApproval(e.target.value)}><option value="">Any sign-up status</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="waiting">Waiting for reply</option><option value="rejected">Rejected</option></select>
        <select aria-label="Membership" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Any membership</option>{levels.map((l) => <option key={l}>{l}</option>)}<option value="__none">No membership</option></select>
        <select aria-label="Needs attention" value={flag} onChange={(e) => setFlag(e.target.value)}>{FLAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <details className="pl-cols"><summary>Columns</summary><div>{COLS.filter((c) => c.key !== "name").map((c) => <label key={c.key}><input type="checkbox" checked={on.includes(c.key)} onChange={() => toggle(c.key)} /> {c.label}</label>)}</div></details>
        <a className="btn" href={"/api/webmaster/people?export=1&" + qs()} download>Export CSV</a>
      </div>
      <p className="sub" aria-live="polite">{busy ? "Searching…" : `${total.toLocaleString()} ${total === 1 ? "person" : "people"}${filtered ? " match" : ""}`}{filtered && <> · <button type="button" className="link" onClick={reset}>Clear filters</button></>}</p>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="card pl-wrap">
        <table className="pl">
          <thead><tr><th className="pl-ph"><span className="sr-only">Photo</span></th>{cols.map((c) => <th key={c.key} aria-sort={c.sort && sort === c.sort ? (dir === "asc" ? "ascending" : "descending") : undefined}>{c.sort ? <button type="button" onClick={() => pick(c.sort!)}>{c.label}{sort === c.sort ? (dir === "asc" ? " ▲" : " ▼") : ""}</button> : c.label}</th>)}{canEdit && <th />}</tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.disabled ? "off" : ""}>
                <td className="pl-ph">{p.roster ? <img src={`/api/webmaster/users/${p.id}/roster`} alt="" loading="lazy" width={32} height={42} /> : <span aria-hidden>{(p.name[0] ?? "?").toUpperCase()}</span>}</td>
                {cols.map((c) => <td key={c.key}>{c.key === "name" ? <Link href={`/admin/people/people/${p.id}`}>{p.name}</Link> : cell(p, c.key)}</td>)}
                {canEdit && <td><DisableButton id={p.id} name={p.name} disabled={p.disabled} onChange={(d) => setRows((rs) => rs.map((x) => (x.id === p.id ? { ...x, disabled: d } : x)))} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !busy && <p className="sub" style={{ padding: 16 }}>No one found.</p>}
      </div>
      {rows.length < total && <p style={{ textAlign: "center" }}><button type="button" disabled={busy} onClick={() => load(true)}>Show more ({(total - rows.length).toLocaleString()} left)</button></p>}
    </>
  );
}
