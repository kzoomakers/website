"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Notice, { msgKind } from "@/components/notice";
import { confirmDialog } from "@/components/dialog";
import type { GuestCfg } from "@/lib/guests";
import "../people.css";

type Row = { id: number; name: string; email: string; host: string; host_id: number; ready: boolean; next: string | null; has_id: boolean; id_expired: boolean; ever_signed: boolean; needs_resign: boolean; visits: number; last_visit: string | null; added: string; retain_until: string | null; deletable: boolean; delete_requested_at: string | null };
const FLAGS: [string, string][] = [["", "Everyone"], ["incomplete", "Incomplete"], ["id_expired", "ID expired"], ["needs_resign", "Must re-sign"], ["never_signed", "Never signed"], ["never_visited", "Never checked in"], ["deletable", "Can be deleted now"], ["delete_requested", "Asked to be deleted"]];
const COLS: [string, string, string | null][] = [["name", "Guest", "name"], ["host", "Host", "host"], ["status", "Status", "status"], ["agreement", "Agreement", null], ["id", "ID", null], ["visits", "Visits", "visits"], ["last_visit", "Last visit", "last_visit"], ["added", "Added", "added"]];
type Visit = { at: string; first_name: string; last_name: string; host: string };
const rpc = async <T,>(op: string, args: Record<string, unknown> = {}): Promise<T> => {
  const r = await fetch("/api/webmaster/guests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const day = (s: string) => new Date(s).toLocaleDateString([], { dateStyle: "medium" });

export default function GuestsAdmin({ initial, visits, cfg: c0, canEdit }: { initial: { rows: Row[]; total: number }; visits: Visit[]; cfg: GuestCfg; canEdit: boolean }) {
  const [vs, setVs] = useState(visits), [vf, setVf] = useState({ q: "", from: "", to: "" }), [rows, setRows] = useState(initial.rows), [total, setTotal] = useState(initial.total), [cfg, setCfg] = useState(c0), [msg, setMsg] = useState(""), [tab, setTab] = useState("guests");
  const [q, setQ] = useState(""), [dq, setDq] = useState(""), [flag, setFlag] = useState(""), [sort, setSort] = useState("added"), [dir, setDir] = useState("desc"), [busy, setBusy] = useState(false), seq = useRef(0), first = useRef(true);
  useEffect(() => { const t = setTimeout(() => setDq(q), 400); return () => clearTimeout(t); }, [q]);
  const load = async (more: boolean) => {
    const my = ++seq.current;
    setBusy(true);
    const r = await rpc<{ rows: Row[]; total: number }>("search", { q: dq, flag, sort, dir, offset: more ? rows.length : 0 }).catch(() => null);
    if (my !== seq.current) return;
    setBusy(false);
    if (!r) return setMsg("Search failed. Try again.");
    setTotal(r.total); setRows(more ? [...rows, ...r.rows] : r.rows);
  };
  useEffect(() => { if (first.current) { first.current = false; return; } load(false); }, [dq, flag, sort, dir]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (k: string) => { if (k === sort) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir(k === "name" || k === "host" ? "asc" : "desc"); } };
  const filtered = !!(q || flag);
  const findVisits = async (f: typeof vf) => { setVf(f); setVs(await rpc<Visit[]>("visits", f).catch(() => [])); };
  const save = async () => { try { setCfg(await rpc<GuestCfg>("saveCfg", { cfg })); setMsg("Settings saved."); } catch (e: any) { setMsg(e.message); } };
  const del = async (r: Row) => {
    const warn = r.deletable ? `Delete ${r.name} and everything we hold about them?` : `WARNING: ${r.name} is still inside the record-keeping period (until ${day(r.retain_until!)}). Deleting now is before the retention period ends. Delete everything anyway?`;
    if (!(await confirmDialog(warn, { ok: "Delete", danger: true }))) return;
    try { await rpc("delete", { id: r.id, override: true }); await load(false); setMsg("Deleted."); } catch (e: any) { setMsg(e.message); }
  };
  const tier = (i: number, k: "from" | "send", v: string) => setCfg({ ...cfg, noticeTiers: cfg.noticeTiers.map((t, j) => (j === i ? { ...t, [k]: Number(v) } : t)) });
  return <>
    <h1>Guests</h1>
    <p className="sub">Guests brought by members. Records are kept for the retention period after a guest's last visit, then a member (or the guest) can delete them. Admins can delete earlier, with a warning.</p>
    <Notice kind={msgKind(msg)}>{msg}</Notice>
    <nav className="bar" aria-label="Guest sections">{[["guests", "Guests"], ["visits", "Check-ins"], ["settings", "Settings"]].map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} className={tab === k ? "pri" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>

    {tab === "settings" && <section className="card" style={{ display: "grid", gap: 10, maxWidth: 760, margin: "14px 0" }}>
      <h2 style={{ margin: 0 }}>Settings</h2>
      <div className="bar">
        <label>Years to keep records <input type="number" min={1} max={20} value={cfg.retentionYears} onChange={(e) => setCfg({ ...cfg, retentionYears: Number(e.target.value) })} style={{ width: 70 }} /></label>
        <label>QR / guest link lasts (hours) <input type="number" min={1} max={168} value={cfg.linkHours} onChange={(e) => setCfg({ ...cfg, linkHours: Number(e.target.value) })} style={{ width: 70 }} /></label>
        <label>Warn after visits in 7 days <input type="number" min={1} max={50} value={cfg.weeklyLimit} onChange={(e) => setCfg({ ...cfg, weeklyLimit: Number(e.target.value) })} style={{ width: 70 }} /></label>
        <label>Scheduled deletions a day <input type="number" min={0} max={1000} value={cfg.deletePerDay} onChange={(e) => setCfg({ ...cfg, deletePerDay: Number(e.target.value) })} style={{ width: 70 }} /></label>
      </div>
      <h3 style={{ margin: "6px 0 0" }}>Agreement update emails to guests, per day</h3>
      <p className="sub" style={{ margin: 0 }}>When the guest agreement changes, past guests are emailed a few at a time. The number allowed depends on how many emails the site has already sent today (all kinds), so it backs off as the day fills up. The row with the highest “emails today” that fits is used.</p>
      {cfg.noticeTiers.map((t, i) => <div className="bar" key={i}>
        <label>When emails sent today are at least <input type="number" min={0} value={t.from} onChange={(e) => tier(i, "from", e.target.value)} style={{ width: 80 }} /></label>
        <label>send at most <input type="number" min={0} value={t.send} onChange={(e) => tier(i, "send", e.target.value)} style={{ width: 70 }} /> guest emails today</label>
        {cfg.noticeTiers.length > 1 && <button type="button" onClick={() => setCfg({ ...cfg, noticeTiers: cfg.noticeTiers.filter((_, j) => j !== i) })}>Remove</button>}
      </div>)}
      <div className="bar"><button type="button" onClick={() => setCfg({ ...cfg, noticeTiers: [...cfg.noticeTiers, { from: 90, send: 0 }] })}>+ Add a row</button>{canEdit && <button type="button" className="pri" onClick={save}>Save settings</button>}</div>
    </section>}

    {tab === "guests" && <>
      <div className="bar pl-bar" style={{ marginTop: 12 }}>
        <input type="search" aria-label="Search guests" placeholder="Search guest name, email or host" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 320px", minWidth: 240 }} />
        <select aria-label="Show" value={flag} onChange={(e) => setFlag(e.target.value)}>{FLAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <p className="sub" aria-live="polite">{busy ? "Searching…" : `${total.toLocaleString()} ${total === 1 ? "guest" : "guests"}${filtered ? " match" : ""}`}{filtered && <> · <button type="button" className="link" onClick={() => { setQ(""); setDq(""); setFlag(""); }}>Clear filters</button></>}</p>
      <div className="card pl-wrap">
        <table className="pl">
          <thead><tr><th className="pl-ph"><span className="sr-only">Initials</span></th>{COLS.map(([k, l, s]) => <th key={k} aria-sort={s && sort === s ? (dir === "asc" ? "ascending" : "descending") : undefined}>{s ? <button type="button" onClick={() => pick(s)}>{l}{sort === s ? (dir === "asc" ? " ▲" : " ▼") : ""}</button> : l}</th>)}{canEdit && <th />}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}>
            <td className="pl-ph"><span aria-hidden>{(r.name[0] ?? "?").toUpperCase()}</span></td>
            <td><Link href={`/admin/people/guests/${r.id}`}>{r.name}</Link><br /><small className="sub">{r.email}</small></td>
            <td><Link href={`/admin/people/people/${r.host_id}`}>{r.host}</Link></td>
            <td>{r.ready ? <span className="chip ok">Ready</span> : <span className="chip warn">Incomplete</span>}{r.delete_requested_at && <span className="chip bad">asked to be deleted</span>}</td>
            <td>{r.needs_resign ? <span className="chip warn">must re-sign</span> : r.ever_signed ? <span className="chip ok">signed</span> : <span className="sub">never</span>}</td>
            <td>{r.id_expired ? <span className="chip bad">expired</span> : r.has_id ? <span className="chip ok">on file</span> : <span className="sub">none</span>}</td>
            <td>{r.visits}</td>
            <td>{r.last_visit ? day(r.last_visit) : <span className="sub">never</span>}</td>
            <td>{day(r.added)}</td>
            {canEdit && <td><button type="button" onClick={() => del(r)}>Delete</button></td>}
          </tr>)}</tbody>
        </table>
        {!rows.length && !busy && <p className="sub" style={{ padding: 16 }}>No guests match.</p>}
      </div>
      {rows.length < total && <p style={{ textAlign: "center" }}><button type="button" disabled={busy} onClick={() => load(true)}>Show more ({(total - rows.length).toLocaleString()} left)</button></p>}
    </>}

    {tab === "visits" && <section style={{ display: "grid", gap: 8, maxWidth: 760, marginTop: 18 }}>
      <h2 style={{ marginBottom: 0 }}>Guest check-ins</h2>
      <div className="bar">
        <input type="search" placeholder="Guest or host name" value={vf.q} onChange={(e) => findVisits({ ...vf, q: e.target.value })} />
        <label>From <input type="date" value={vf.from} onChange={(e) => findVisits({ ...vf, from: e.target.value })} /></label>
        <label>To <input type="date" value={vf.to} onChange={(e) => findVisits({ ...vf, to: e.target.value })} /></label>
        <small className="sub">{vs.length} shown (newest 500)</small>
      </div>
      <div className="card">{vs.map((v, i) => <div key={i} className="bar" style={{ justifyContent: "space-between", borderTop: i ? "1px solid var(--line)" : 0, padding: "6px 0" }}><span><strong>{v.first_name} {v.last_name}</strong> <small>host {v.host}</small></span><small>{when(v.at)}</small></div>)}{!vs.length && <p className="sub">No visits found.</p>}</div>
    </section>}
  </>;
}
