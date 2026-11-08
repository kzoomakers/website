"use client";
import { useDirtyGuard } from "@/components/dirty-guard";
import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog } from "@/components/dialog";
import { crm } from "../rpc";
import type { Klass, Proposal } from "@/lib/crm";

type F = Partial<Klass> & { title: string; starts_at: string };
const local = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const BLANK: F = { title: "", starts_at: "", ends_at: "", description: "", location: "", instructor: "", capacity: 0, price: "", cancelled: false };

// Classes members can sign up for. Capacity 0 = unlimited; sign-ups past capacity wait and move up automatically.
const dt = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

/** Member class proposals waiting for a decision; approving creates the class (date, place, size and price can be adjusted first). */
function Proposals({ canEdit, onChange }: { canEdit: boolean; onChange: () => void }) {
  const [rows, setRows] = useState<Proposal[]>([]), [minDays, setMin] = useState(45), [announce, setAnn] = useState(false), [open, setOpen] = useState(0), [e, setE] = useState<any>({}), [why, setWhy] = useState("");
  useDirtyGuard([e, why], open);
  const load = useCallback(() => crm<{ rows: Proposal[] }>("proposals", { status: "pending" }).then((r) => setRows(r.rows), (x) => alertDialog(x.message)), []);
  useEffect(() => { load(); crm<{ minDays: number }>("classRules").then((r) => setMin(r.minDays)); }, [load]);
  const decide = (p: Proposal, action: "approve" | "decline") =>
    crm<{ emailed: number }>("decide", { id: p.id, action, reason: why, announce: announce && action === "approve", edit: { ...e, starts_at: e.starts_at ? new Date(e.starts_at).toISOString() : undefined } }).then((r) => { if (r.emailed) alertDialog(`Scheduled. Emailing ${r.emailed} members now.`); setOpen(0); setWhy(""); load(); onChange(); }, (x) => alertDialog(x.message));
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18 }}>Proposed by members {rows.length > 0 && <span className="tag">{rows.length} waiting</span>}</h2>
      <div className="bar"><label>Members must propose at least <input type="number" min={45} max={365} value={minDays} disabled={!canEdit} style={{ width: 70 }} onChange={(x) => setMin(Number(x.target.value))}
        onBlur={() => canEdit && crm("setMinDays", { days: minDays }).catch((x) => alertDialog(x.message))} /> days ahead</label></div>
      <div className="card">
        {rows.map((p) => (
          <div key={p.id}>
            <div className="row">
              {p.image && <img src={p.image} alt="" width={64} height={36} style={{ objectFit: "cover", borderRadius: 6 }} />}
              <span className="grow"><strong>{p.title}</strong> <small>by <a href={`/admin/crm/people/${p.user_id}`}>{p.name}</a> · {p.level}</small></span>
              <span className="tag">{dt(p.starts_at)}</span>
              <button onClick={() => { setOpen(open === p.id ? 0 : p.id); setE({ starts_at: local(p.starts_at), location: p.location, capacity: p.capacity, price: p.price }); setWhy(""); }}>{open === p.id ? "Close" : "Review"}</button>
            </div>
            {open === p.id && <div style={{ padding: "0 0 14px", display: "grid", gap: 8 }}>
              {p.summary && <em>{p.summary}</em>}
              <p style={{ whiteSpace: "pre-line", margin: 0 }}>{p.description}</p>
              <small>{p.duration_min} min{p.prerequisites && ` · Before: ${p.prerequisites}`}{p.materials && ` · Materials: ${p.materials}`}{p.notes && ` · Note: ${p.notes}`}</small>
              {canEdit && <>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
                  <label>Starts<input type="datetime-local" value={e.starts_at ?? ""} onChange={(x) => setE({ ...e, starts_at: x.target.value })} style={{ width: "100%" }} /></label>
                  <label>Location<input value={e.location ?? ""} onChange={(x) => setE({ ...e, location: x.target.value })} style={{ width: "100%" }} /></label>
                  <label>Capacity<input type="number" min={0} value={e.capacity ?? 0} onChange={(x) => setE({ ...e, capacity: Number(x.target.value) })} style={{ width: "100%" }} /></label>
                  <label>Price<input value={e.price ?? ""} onChange={(x) => setE({ ...e, price: x.target.value })} style={{ width: "100%" }} /></label>
                </div>
                <label>If declining, tell them why<input value={why} onChange={(x) => setWhy(x.target.value)} style={{ width: "100%" }} /></label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={announce} onChange={(x) => setAnn(x.target.checked)} /> Email all members a preview with a one-click sign-in link (valid 90 days) so they can book right away</label>
                <div className="bar"><button className="pri" onClick={() => decide(p, "approve")}>Approve & schedule</button><button style={{ color: "var(--bad)" }} onClick={() => decide(p, "decline")}>Decline</button></div>
              </>}
            </div>}
          </div>
        ))}
        {!rows.length && <p className="sub">Nothing waiting for review.</p>}
      </div>
    </section>
  );
}

export default function Classes({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Klass[]>([]), [f, setF] = useState<F | null>(null), [roster, setRoster] = useState<{ id: number; rows: any[] } | null>(null);
  useDirtyGuard(f, f ? (f as any).id ?? "new" : "closed");
  const load = useCallback(() => crm<Klass[]>("classes").then(setRows, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <h1>Classes</h1>
      <p className="sub">Members sign up at /members/classes.</p>
      <Proposals canEdit={canEdit} onChange={load} />
      <h2 style={{ fontSize: 18 }}>Schedule</h2>
      {canEdit && <div className="bar"><button className="pri" onClick={() => setF({ ...BLANK })}>+ New class</button></div>}
      {f && (
        <form className="card" style={{ display: "grid", gap: 8, padding: 16, marginBottom: 16 }} onSubmit={async (e) => {
          e.preventDefault();
          try { await crm("saveClass", { klass: { ...f, starts_at: new Date(f.starts_at).toISOString(), ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null } }); setF(null); load(); } catch (x: any) { alertDialog(x.message); }
        }}>
          <label>Title<input required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ width: "100%" }} /></label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label>Starts<input required type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} style={{ width: "100%" }} /></label>
            <label>Ends (optional)<input type="datetime-local" value={f.ends_at ?? ""} onChange={(e) => setF({ ...f, ends_at: e.target.value })} style={{ width: "100%" }} /></label>
            <label>Location<input maxLength={120} value={f.location ?? ""} onChange={(e) => setF({ ...f, location: e.target.value })} style={{ width: "100%" }} /></label>
            <label>Instructor<input maxLength={120} value={f.instructor ?? ""} onChange={(e) => setF({ ...f, instructor: e.target.value })} style={{ width: "100%" }} /></label>
            <label>Capacity (0 = unlimited)<input type="number" min={0} max={500} value={f.capacity ?? 0} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} style={{ width: "100%" }} /></label>
            <label>Price<input maxLength={60} placeholder="e.g. $25 or Free" value={f.price ?? ""} onChange={(e) => setF({ ...f, price: e.target.value })} style={{ width: "100%" }} /></label>
          </div>
          <label>Description<textarea rows={4} maxLength={2000} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ width: "100%" }} /></label>
          <label><input type="checkbox" checked={!!f.cancelled} onChange={(e) => setF({ ...f, cancelled: e.target.checked })} /> Cancelled (hidden from members)</label>
          <div className="bar"><button className="pri">Save</button><button type="button" onClick={() => setF(null)}>Cancel</button></div>
        </form>
      )}
      <div className="card">
        {rows.map((c) => (
          <div key={c.id}>
            <div className="row">
              <span className="grow">{c.title}</span>{c.cancelled && <span className="tag" style={{ color: "var(--bad)" }}>cancelled</span>}
              <span className="tag">{when(c.starts_at)}</span><span className="tag">{c.signed}{c.capacity ? ` / ${c.capacity}` : ""} signed up</span>
              <button onClick={async () => setRoster(roster?.id === c.id ? null : { id: c.id, rows: await crm("roster", { id: c.id }) })}>Roster</button>
              {canEdit && <>
                <button onClick={() => setF({ ...c, starts_at: local(c.starts_at), ends_at: local(c.ends_at) })}>Edit</button>
                <button style={{ color: "var(--bad)" }} onClick={async () => { if (await confirmDialog(`Delete “${c.title}” and its ${c.signed} sign-up${c.signed === 1 ? "" : "s"}?`, { ok: "Delete", danger: true })) crm("deleteClass", { id: c.id }).then(load, (e) => alertDialog(e.message)); }}>Delete</button>
              </>}
            </div>
            {roster?.id === c.id && <div style={{ padding: "0 0 10px 16px" }}>
              {roster.rows.map((p) => <div key={p.id}>{p.pos}. <a href={`/admin/crm/people/${p.id}`}>{p.name}</a> <small>{p.email}{p.phone && ` · ${p.phone}`}</small>{c.capacity > 0 && p.pos > c.capacity && <em> (waitlist)</em>}</div>)}
              {!roster.rows.length && <small>No one yet.</small>}
            </div>}
          </div>
        ))}
        {!rows.length && <p className="sub">No classes yet.</p>}
      </div>
    </>
  );
}
