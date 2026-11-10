"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Notice from "@/components/notice";
import { alertDialog, confirmDialog } from "@/components/dialog";
import type { Guest } from "@/lib/guests";
import GuestWizard from "./guest-wizard";
import { WZ_CSS, json } from "./wizard";

// "I brought a Guest" on the members home page: a modal with the member's guests on the left (full screen on a phone: list, then detail) and the New Guest wizard.
type Row = { id: number; first_name: string; last_name: string; ready: boolean; next: string | null; has_photo: boolean; last_visit: string | null };
type Detail = { guest: Guest; visits: string[]; retention_years: number };
const CSS = `dialog.wz.gm{width:min(980px,calc(100% - 24px));height:min(640px,calc(100dvh - 24px))}
.gm-grid{display:grid;grid-template-columns:280px 1fr;min-height:calc(100% - 60px)}
.gm-list{border-right:1px solid var(--line);display:grid;align-content:start;gap:6px;padding:14px}
.gm-row{display:flex;gap:10px;align-items:center;text-align:left;width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit;cursor:pointer;min-height:48px}
.gm-row[aria-current=true]{border-color:var(--acc);background:var(--acc-bg)}
.gm-ph{width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none;background:var(--line);display:grid;place-items:center;font-size:12px}
.gm-tag{font-size:11px;font-weight:700;letter-spacing:.4px;color:#fff;background:#b8860b;border-radius:99px;padding:2px 7px;margin-left:6px}
.gm-pane{padding:20px;display:grid;align-content:start;gap:14px}
.gm-big{width:140px;height:140px;border-radius:12px;object-fit:cover;background:var(--line);flex:none}
@media(max-width:700px){dialog.wz.gm{width:100%;max-width:100%;height:100dvh;max-height:100dvh;border-radius:0}.gm-grid{grid-template-columns:1fr}.gm-list{border-right:0}.gm-grid[data-view=detail] .gm-list,.gm-grid[data-view=list] .gm-pane{display:none}.gm button{min-height:46px}}
@media(min-width:701px){.gm-back{display:none}}`;
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const nameOf = (g: { first_name: string; last_name: string }) => `${g.first_name} ${g.last_name}`.trim() || "New guest";

/** The home-page card (styled like its neighbours in the card row) and the modal it opens. */
export default function GuestCard() {
  const [open, setOpen] = useState(false);
  return <>
    <a className="card" href="#guests" role="button" onClick={(e) => { e.preventDefault(); setOpen(true); }}><b>I brought</b>a Guest</a>
    {open && <GuestModal onClose={() => setOpen(false)} />}
  </>;
}

function GuestModal({ onClose }: { onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null), [sel, setSel] = useState<number | null>(null), [d, setD] = useState<Detail | null>(null), [err, setErr] = useState("");
  const [wiz, setWiz] = useState<{ id: number; resume: boolean } | null>(null), [busy, setBusy] = useState(false), [stamp, setStamp] = useState(0);
  useEffect(() => { if (!wiz) dlg.current?.showModal(); }, [wiz]);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/guests", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setRows((await r.json()).guests); else setErr(r ? await r.text() : "Couldn't reach the server.");
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const loadDetail = useCallback(async (id: number) => {
    const r = await fetch("/api/guests?g=" + id, { cache: "no-store" }).catch(() => null);
    if (r?.ok) { setD(await r.json()); setStamp(Date.now()); } else setErr(r ? await r.text() : "Couldn't reach the server.");
  }, []);
  useEffect(() => { setD(null); if (sel) loadDetail(sel); }, [sel, loadDetail]);

  const start = async () => {
    setBusy(true); setErr("");
    const r = await json("POST", "/api/guests", { op: "create" }).catch(() => null);
    setBusy(false);
    if (r?.ok) { const { id } = await r.json(); setWiz({ id, resume: false }); } else setErr(r ? await r.text() : "Couldn't reach the server.");
  };
  const closeWiz = () => { const id = wiz?.id; setWiz(null); refresh(); if (id) { setSel(id); loadDetail(id); } };

  const checkIn = async (g: Guest) => {
    setBusy(true); setErr("");
    const r = await json("POST", "/api/guests", { op: "checkin", g: g.id }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r ? await r.text() : "Couldn't reach the server.");
    const c = await r.json();
    await loadDetail(g.id); refresh();
    if (c.already) await alertDialog(`${g.first_name} was already checked in today at ${new Date(c.at).toLocaleTimeString([], { timeStyle: "short" })}.`);
    else if (c.nag) await alertDialog("Hey, they need a membership now. Just kidding.");
  };
  const remove = async (g: Guest, years: number) => {
    if (!g.deletable) return void (await alertDialog(`Sorry! We have to retain their records for ${years} years.\nThey can be deleted after ${new Date(g.retain_until!).toLocaleDateString([], { dateStyle: "long" })}.`));
    if (!(await confirmDialog("This will delete all data for this guest in our system. Are you sure?", { ok: "Delete", danger: true }))) return;
    const r = await json("POST", "/api/guests", { op: "delete", g: g.id }).catch(() => null);
    if (r?.ok) { setSel(null); setD(null); refresh(); } else setErr(r ? await r.text() : "Couldn't reach the server.");
  };

  if (wiz) return <GuestWizard id={wiz.id} resume={wiz.resume} onClose={closeWiz} />;
  const g = d?.guest;
  return (
    <dialog ref={dlg} className="wz gm" aria-labelledby="gm-h" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <style>{WZ_CSS + CSS}</style>
      <div className="wz-top" style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h2 id="gm-h" style={{ margin: 0 }}>Your guests</h2>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <div className="gm-grid" data-view={sel ? "detail" : "list"}>
        <div className="gm-list">
          <button type="button" className="pri" disabled={busy} onClick={start}>+ New Guest</button>
          {rows === null ? <p role="status">Loading…</p> : !rows.length ? <p className="sub">You have nobody.</p>
            : rows.map((r) => <button key={r.id} type="button" className="gm-row" aria-current={sel === r.id} onClick={() => setSel(r.id)}>
              {r.has_photo ? <img className="gm-ph" alt="" src={`/api/guests/photo?g=${r.id}`} /> : <span className="gm-ph" aria-hidden>👤</span>}
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}><b>{nameOf(r)}</b>{!r.ready && <span className="gm-tag">INCOMPLETE</span>}</span>
            </button>)}
          <Notice kind="error">{err}</Notice>
        </div>
        <div className="gm-pane">
          {!sel ? <p className="sub">Pick a guest to see their photo and check them in, or add a new one.</p>
            : !g ? <p role="status">Loading…</p> : <>
            <div><button type="button" className="gm-back" onClick={() => setSel(null)}>← Back</button></div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {g.has_photo ? <img className="gm-big" alt={`Photo ID of ${nameOf(g)}`} src={`/api/guests/photo?g=${g.id}&v=${stamp}`} /> : <span className="gm-big" aria-hidden style={{ display: "grid", placeItems: "center", fontSize: 48 }}>👤</span>}
              <div><h2 style={{ margin: 0 }}>{nameOf(g)}</h2>{g.ready ? <p className="sub" style={{ margin: "4px 0 0" }}>Ready</p> : <p style={{ margin: "4px 0 0" }}><span className="gm-tag" style={{ marginLeft: 0 }}>INCOMPLETE</span></p>}
                {g.last_visit && <p className="sub" style={{ margin: "4px 0 0" }}>Last visit {when(g.last_visit)}</p>}</div>
            </div>
            {g.ready ? <div><button type="button" className="pri" disabled={busy} onClick={() => checkIn(g)}>Check in</button></div>
              : <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                {g.needs_resign && <Notice kind="info">The guest agreement changed. They need to sign the new version before their next check-in.</Notice>}
                <button type="button" className="pri" onClick={() => setWiz({ id: g.id, resume: true })}>{g.needs_resign ? "Sign the new agreement" : "Resume"}</button></div>}
            <section><h3 style={{ margin: "0 0 6px" }}>Previous check-ins</h3>
              {d!.visits.length ? <ul style={{ margin: 0 }}>{d!.visits.map((v) => <li key={v}>{when(v)}</li>)}</ul> : <p className="sub" style={{ margin: 0 }}>No check-ins yet.</p>}</section>
            <div><button type="button" onClick={() => remove(g, d!.retention_years)}>Delete</button></div>
          </>}
        </div>
      </div>
    </dialog>
  );
}
