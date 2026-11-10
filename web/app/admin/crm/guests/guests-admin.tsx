"use client";
import { useState } from "react";
import Notice, { msgKind } from "@/components/notice";
import { confirmDialog } from "@/components/dialog";
import type { GuestCfg } from "@/lib/guests";

type Row = { id: number; name: string; email: string; host: string; ready: boolean; next: string | null; last_visit: string | null; retain_until: string | null; deletable: boolean; delete_requested_at: string | null };
type Visit = { at: string; first_name: string; last_name: string; host: string };
const rpc = async <T,>(op: string, args: Record<string, unknown> = {}): Promise<T> => {
  const r = await fetch("/api/webmaster/guests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const day = (s: string) => new Date(s).toLocaleDateString([], { dateStyle: "medium" });

export default function GuestsAdmin({ initial, visits, cfg: c0, canEdit }: { initial: Row[]; visits: Visit[]; cfg: GuestCfg; canEdit: boolean }) {
  const [vs, setVs] = useState(visits), [vf, setVf] = useState({ q: "", from: "", to: "" }), [rows, setRows] = useState(initial), [q, setQ] = useState(""), [cfg, setCfg] = useState(c0), [msg, setMsg] = useState("");
  const search = async (v: string) => { setQ(v); setRows(await rpc<Row[]>("list", { q: v }).catch(() => [])); };
  const findVisits = async (f: typeof vf) => { setVf(f); setVs(await rpc<Visit[]>("visits", f).catch(() => [])); };
  const save = async () => { try { setCfg(await rpc<GuestCfg>("saveCfg", { cfg })); setMsg("Settings saved."); } catch (e: any) { setMsg(e.message); } };
  const del = async (r: Row) => {
    const warn = r.deletable ? `Delete ${r.name} and everything we hold about them?` : `WARNING: ${r.name} is still inside the record-keeping period (until ${day(r.retain_until!)}). Deleting now is before the retention period ends. Delete everything anyway?`;
    if (!(await confirmDialog(warn, { ok: "Delete", danger: true }))) return;
    try { await rpc("delete", { id: r.id, override: true }); await search(q); setMsg("Deleted."); } catch (e: any) { setMsg(e.message); }
  };
  const tier = (i: number, k: "from" | "send", v: string) => setCfg({ ...cfg, noticeTiers: cfg.noticeTiers.map((t, j) => (j === i ? { ...t, [k]: Number(v) } : t)) });
  return <>
    <h1>Guests</h1>
    <p className="sub">Guests brought by members. Records are kept for the retention period after a guest's last visit, then a member (or the guest) can delete them. Admins can delete earlier, with a warning.</p>
    <Notice kind={msgKind(msg)}>{msg}</Notice>

    <section className="card" style={{ display: "grid", gap: 10, maxWidth: 760, margin: "14px 0" }}>
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
    </section>

    <section style={{ display: "grid", gap: 8, maxWidth: 980 }}>
      <h2 style={{ marginBottom: 0 }}>All guests</h2>
      <input type="search" placeholder="Search guest, email or host" value={q} onChange={(e) => search(e.target.value)} />
      <div className="card">
        {rows.map((r) => <div key={r.id} className="bar" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", padding: "8px 0" }}>
          <span><strong>{r.name}</strong> <small>{r.email}</small><br /><small className="sub">Host {r.host} · {r.ready ? "Ready" : "INCOMPLETE"}{r.last_visit ? ` · last visit ${day(r.last_visit)}` : " · never checked in"}{r.retain_until ? ` · keep until ${day(r.retain_until)}` : " · never signed"}{r.delete_requested_at ? " · asked to be deleted" : ""}</small></span>
          {canEdit && <button type="button" onClick={() => del(r)}>Delete</button>}
        </div>)}
        {!rows.length && <p className="sub">No guests match.</p>}
      </div>
    </section>

    <section style={{ display: "grid", gap: 8, maxWidth: 760, marginTop: 18 }}>
      <h2 style={{ marginBottom: 0 }}>Guest visits</h2>
      <div className="bar">
        <input type="search" placeholder="Guest or host name" value={vf.q} onChange={(e) => findVisits({ ...vf, q: e.target.value })} />
        <label>From <input type="date" value={vf.from} onChange={(e) => findVisits({ ...vf, from: e.target.value })} /></label>
        <label>To <input type="date" value={vf.to} onChange={(e) => findVisits({ ...vf, to: e.target.value })} /></label>
        <small className="sub">{vs.length} shown (newest 500)</small>
      </div>
      <div className="card">{vs.map((v, i) => <div key={i} className="bar" style={{ justifyContent: "space-between", borderTop: i ? "1px solid var(--line)" : 0, padding: "6px 0" }}><span><strong>{v.first_name} {v.last_name}</strong> <small>host {v.host}</small></span><small>{when(v.at)}</small></div>)}{!vs.length && <p className="sub">No visits found.</p>}</div>
    </section>
  </>;
}
