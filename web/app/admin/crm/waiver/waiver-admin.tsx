"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { Agreement, Changes } from "@/components/agreement";
import { diffVersions, summarize, type Section, type Version } from "@/lib/waiver-diff";

type V = Version & { signed: number };
type M = { id: number; name: string; email: string; version_id: number | null; revision: string | null; signed_at: string | null; doc_id: number | null; must_resign: boolean };
const rpc = async <T,>(op: string, args: Record<string, unknown> = {}): Promise<T> => {
  const r = await fetch("/api/webmaster/waiver", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const nextRev = (r: string) => r.replace(/(\d+)$/, (n) => String(Number(n) + 1));

export default function WaiverAdmin({ initial, canEdit }: { initial: V[]; canEdit: boolean }) {
  const [vs, setVs] = useState(initial), [tab, setTab] = useState<"edit" | "versions" | "members">("edit"), cur = vs[0];
  const [d, setD] = useState({ revision: nextRev(cur.revision), title: cur.title, closing: cur.closing, sections: cur.sections.map((s) => ({ ...s })) as Section[], summary: "", mandatory: true });
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [mem, setMem] = useState<M[] | null>(null), [mf, setMf] = useState({ q: "", version: "" });
  const changes = diffVersions(cur, d), set = (i: number, k: keyof Section, v: string) => setD({ ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const move = (i: number, by: number) => { const a = [...d.sections], j = i + by; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setD({ ...d, sections: a }); };
  const loadMembers = async (f = mf) => { setMf(f); setMem(await rpc<M[]>("members", f).catch(() => [])); };
  const show = (t: typeof tab) => { setTab(t); if (t === "members" && !mem) loadMembers(); };
  const publish = async () => {
    const n = d.mandatory ? ` Every approved member will be emailed and must sign it at their next sign-in.` : " Members who already signed are not asked again.";
    if (!(await confirmDialog(`Publish revision ${d.revision}? It can never be edited or deleted afterwards; changes mean a new revision.${n}`, { ok: "Publish" }))) return;
    setBusy(true); setMsg("");
    try { await rpc("publish", { draft: d }); const nv = await rpc<V[]>("versions"); setVs(nv); setD({ revision: nextRev(d.revision), title: d.title, closing: d.closing, sections: d.sections, summary: "", mandatory: true }); setMem(null); setMsg(`Revision ${d.revision} is live.`); setTab("versions"); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <>
      <h1>Membership agreement &amp; liability waiver</h1>
      <p className="sub">New members sign this after approval. Publishing a change makes a new numbered version: the old ones are kept forever, along with every member's signed copy.</p>
      <nav className="bar" role="tablist">
        {([["edit", "Edit & publish"], ["versions", `Versions (${vs.length})`], ["members", "Who signed what"]] as const).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "pri" : ""} onClick={() => show(t)}>{l}</button>)}
        {msg && <span role="status" className="sub" style={{ margin: 0 }}>{msg}</span>}
      </nav>

      {tab === "edit" && (
        <div style={{ display: "grid", gap: 14, maxWidth: 820 }}>
          <p className="sub" style={{ margin: 0 }}>You're editing a copy of the current version (revision {cur.revision}). Nothing changes for members until you publish.</p>
          <div className="bar"><label>Revision <input value={d.revision} onChange={(e) => setD({ ...d, revision: e.target.value })} style={{ width: 110 }} /></label><label style={{ flex: 1 }}>Title <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} /></label></div>
          {d.sections.map((s, i) => (
            <fieldset key={i} className="card" style={{ display: "grid", gap: 6 }}>
              <div className="bar"><input aria-label="Heading" value={s.heading} onChange={(e) => set(i, "heading", e.target.value)} style={{ flex: 1, fontWeight: 700, textTransform: "uppercase" }} />
                <button type="button" onClick={() => move(i, -1)} aria-label="Move up">↑</button><button type="button" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" onClick={async () => { if (await confirmDialog(`Remove the "${s.heading}" section from this draft?`, { ok: "Remove", danger: true })) setD({ ...d, sections: d.sections.filter((_, j) => j !== i) }); }}>Remove</button></div>
              <textarea aria-label="Text" value={s.body} onChange={(e) => set(i, "body", e.target.value)} rows={Math.min(14, Math.max(3, Math.ceil(s.body.length / 95) + s.body.split("\n").length))} style={{ width: "100%", boxSizing: "border-box" }} />
            </fieldset>
          ))}
          <button type="button" onClick={() => setD({ ...d, sections: [...d.sections, { heading: "NEW SECTION", body: "" }] })}>+ Add a section</button>
          <label>Closing statement (above the signature line)<textarea value={d.closing} onChange={(e) => setD({ ...d, closing: e.target.value })} rows={3} style={{ width: "100%", boxSizing: "border-box" }} /></label>
          <section className="card" aria-label="What will change">
            <h2 style={{ marginTop: 0 }}>What will change for members</h2>
            <p className="sub">{summarize(changes)}</p>
            <Changes changes={changes} />
            <label>Explain it in plain language: members read this in the email and when they sign again
              <textarea value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} rows={4} placeholder="e.g. Membership dues can now be paid up to the 15th instead of the 10th. We also clarified the guest rule." style={{ width: "100%", boxSizing: "border-box" }} /></label>
            <button type="button" onClick={() => setD({ ...d, summary: d.summary || `Changes: ${summarize(changes)}` })}>Start from the automatic list</button>
            <label style={{ display: "block", marginTop: 10 }}><input type="checkbox" checked={d.mandatory} onChange={(e) => setD({ ...d, mandatory: e.target.checked })} /> Require every member to sign this version (they're emailed and must agree at their next sign-in)</label>
          </section>
          {canEdit && <button className="pri" disabled={busy || !changes.length && d.title === cur.title} onClick={publish}>{busy ? "Publishing…" : `Publish revision ${d.revision}`}</button>}
        </div>
      )}

      {tab === "versions" && (
        <div style={{ display: "grid", gap: 10, maxWidth: 820 }}>
          {vs.map((v, i) => {
            const prev = vs[i + 1];
            return (
              <details key={v.id} className="card" open={i === 0}>
                <summary style={{ cursor: "pointer" }}><strong>Revision {v.revision}</strong> · {when(v.created_at)} · by {v.created_by} {v.mandatory && <span className="tag">everyone re-signed</span>} {i === 0 && <span className="tag">current</span>} <span className="tag">{v.signed} member{v.signed === 1 ? "" : "s"} on this</span></summary>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}><strong>What changed:</strong> {v.summary}</p>
                  <p style={{ margin: 0 }}><a href={`/api/webmaster/member-file?ver=${v.id}`}>Download as PDF</a></p>
                  {prev && <details><summary style={{ cursor: "pointer" }}>Changes from revision {prev.revision} · {summarize(diffVersions(prev, v))}</summary><div style={{ marginTop: 8 }}><Changes changes={diffVersions(prev, v)} /></div></details>}
                  <details><summary style={{ cursor: "pointer" }}>Full text</summary><div style={{ marginTop: 8 }}><Agreement sections={v.sections} closing={v.closing} /></div></details>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {tab === "members" && (
        <>
          <nav className="bar">
            <input type="search" placeholder="Search name or email" value={mf.q} onChange={(e) => loadMembers({ ...mf, q: e.target.value })} />
            <select value={mf.version} onChange={(e) => loadMembers({ ...mf, version: e.target.value })} aria-label="Version"><option value="">All members</option><option value="old">Not on the latest (or never signed)</option><option value="none">Never signed</option>{vs.map((v) => <option key={v.id} value={v.id}>On revision {v.revision}</option>)}</select>
          </nav>
          <div className="card">
            {mem?.map((m) => (
              <div key={m.id} className="bar" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                <span><strong>{m.name}</strong> <small>{m.email}</small></span>
                <span>{m.revision ? <>Revision {m.revision} · {when(m.signed_at!)} {m.doc_id && <a href={`/api/webmaster/member-file?pdf=${m.doc_id}`}>PDF</a>}</> : <em>never signed</em>}{m.must_resign && <span className="tag"> must re-sign</span>}</span>
              </div>
            ))}
            {mem && !mem.length && <p className="sub">No members match.</p>}{!mem && <p className="sub">Loading…</p>}
          </div>
        </>
      )}
    </>
  );
}
