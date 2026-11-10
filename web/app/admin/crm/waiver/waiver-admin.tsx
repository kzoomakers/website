"use client";
import { useDirtyGuard } from "@/components/dirty-guard";
import Notice, { msgKind } from "@/components/notice";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { Agreement, Changes } from "@/components/agreement";
import { diffVersions, summarize, type Section, type Version } from "@/lib/waiver-diff";

type V = Version & { signed: number };
type M = { id: number; name: string; email: string; version_id: number | null; revision: string | null; signed_at: string | null; doc_id: number | null; must_resign: boolean };
type Draft = { revision: string; title: string; sections: Section[]; closing: string; summary: string; mandatory: boolean };
const rpcFor = (kind: string) => async <T,>(op: string, args: Record<string, unknown> = {}): Promise<T> => {
  const r = await fetch("/api/webmaster/waiver", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, kind, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const nextRev = (r: string) => r.replace(/(\d+)$/, (n) => String(Number(n) + 1));

export default function WaiverAdmin({ initial, canEdit, canPublish, ai, kind = "member", draft = null }: { initial: V[]; canEdit: boolean; canPublish: boolean; ai: boolean; kind?: "member" | "guest"; draft?: Draft | null }) {
  const rpc = rpcFor(kind), guest = kind === "guest", who = guest ? "guests" : "members", name = guest ? "Guest agreement" : "Membership agreement";
  const [vs, setVs] = useState(initial), [tab, setTab] = useState<"edit" | "preview" | "versions" | "members">("edit"), cur = vs[0], [saves, setSaves] = useState(0), [hasDraft, setHasDraft] = useState(!!draft);
  const fresh = (v: V, rev = nextRev(v.revision)): Draft => ({ revision: rev, title: v.title, closing: v.closing, sections: v.sections.map((s) => ({ ...s })), summary: "", mandatory: true });
  const [d, setD] = useState<Draft>(draft ?? fresh(cur));
  useDirtyGuard(d, vs.length + saves);
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [thinking, setThinking] = useState(false);
  const [mem, setMem] = useState<M[] | null>(null), [mf, setMf] = useState({ q: "", version: "" });
  const changes = diffVersions(cur, d), set = (i: number, k: keyof Section, v: string) => setD({ ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const move = (i: number, by: number) => { const a = [...d.sections], j = i + by; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setD({ ...d, sections: a }); };
  const loadMembers = async (f = mf) => { setMf(f); setMem(await rpc<M[]>("members", f).catch(() => [])); };
  const show = (t: typeof tab) => { setTab(t); if (t === "members" && !mem) loadMembers(); };
  const summarizeAi = async () => {
    if (d.summary.trim() && !(await confirmDialog("Replace what you've written below with an AI summary?", { ok: "Replace" }))) return;
    setThinking(true); setMsg("");
    try { setD({ ...d, summary: (await rpc<{ text: string }>("aiSummary", { draft: d })).text }); setMsg("AI wrote a draft. Read it and fix anything before you publish."); } catch (e: any) { setMsg(e.message); }
    setThinking(false);
  };
  const saveDraft = async () => {
    setBusy(true); setMsg("");
    try { await rpc("saveDraft", { draft: d }); setHasDraft(true); setSaves((n) => n + 1); setMsg("Draft saved. Nobody but admins can see it, and nobody is asked to sign it."); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  const discard = async () => {
    if (!(await confirmDialog("Throw away this draft and start again from the current published version?", { ok: "Discard draft", danger: true }))) return;
    try { await rpc("discardDraft"); setHasDraft(false); setD(fresh(cur)); setSaves((n) => n + 1); setMsg("Draft discarded."); } catch (e: any) { setMsg(e.message); }
  };
  const publish = async () => {
    const n = guest ? (d.mandatory ? " Every guest who signed before is emailed a few a day and must sign it again before their next check-in." : " Every guest who signed before is emailed a few a day; signing again is optional.")
      : d.mandatory ? ` Every approved member will be emailed and must sign it at their next sign-in.` : " Members who already signed are not asked again.";
    if (!(await confirmDialog(`Publish revision ${d.revision}? It can never be edited or deleted afterwards; changes mean a new revision.${n}`, { ok: "Publish" }))) return;
    setBusy(true); setMsg("");
    try { await rpc("publish", { draft: d }); const nv = await rpc<V[]>("versions"); setVs(nv); setD({ revision: nextRev(d.revision), title: d.title, closing: d.closing, sections: d.sections, summary: "", mandatory: true }); setMem(null); setHasDraft(false); setMsg(`Revision ${d.revision} is live.`); setTab("versions"); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <>
      <h1>{name}</h1>
      <p className="sub">{guest ? "Guests sign this on their first visit." : "New members sign this after approval."} Save a draft as often as you like and preview it exactly as signers will see it. Publishing makes a new numbered version: the old ones are kept forever, along with every signed copy.</p>
      <nav className="bar" role="tablist">
        {([["edit", hasDraft ? "Edit (draft saved)" : "Edit"], ["preview", "Preview"], ["versions", `Versions (${vs.length})`], ...(guest ? [] : [["members", "Who signed what"]])] as [typeof tab, string][]).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "pri" : ""} onClick={() => show(t)}>{l}</button>)}
        {msg && <Notice kind={msgKind(msg)}>{msg}</Notice>}
      </nav>

      {tab === "edit" && (
        <div style={{ display: "grid", gap: 14, maxWidth: 820 }}>
          <p className="sub" style={{ margin: 0 }}>You're editing {hasDraft ? "the saved draft" : `a copy of the current version (revision ${cur.revision})`}. Nothing changes for {who} until you publish.</p>
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
            <label>Explain it in plain language: {who} read this in the email and when they sign again
              <textarea value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} rows={4} placeholder="e.g. Membership dues can now be paid up to the 15th instead of the 10th. We also clarified the guest rule." style={{ width: "100%", boxSizing: "border-box" }} /></label>
            {ai && canEdit && <><button type="button" className="pri" disabled={thinking || !changes.length} onClick={summarizeAi}>{thinking ? "Writing…" : "✨ Summarize with AI"}</button>{" "}</>}
            <button type="button" onClick={() => setD({ ...d, summary: d.summary || `Changes: ${summarize(changes)}` })}>Start from the automatic list</button>
            <label style={{ display: "block", marginTop: 10 }}><input type="checkbox" checked={d.mandatory} onChange={(e) => setD({ ...d, mandatory: e.target.checked })} /> {guest ? "Require every guest to sign this version again before their next check-in (they're all emailed either way)" : "Require every member to sign this version (they're emailed and must agree at their next sign-in)"}</label>
          </section>
          {canEdit && <div className="bar">
            <button disabled={busy} onClick={saveDraft}>Save draft</button>
            <button onClick={() => setTab("preview")}>Preview</button>
            {hasDraft && <button onClick={discard}>Discard draft</button>}
            {canPublish ? <button className="pri" disabled={busy || !changes.length && d.title === cur.title} onClick={publish}>{busy ? "Publishing…" : `Publish revision ${d.revision}`}</button>
              : <small className="sub">You can save drafts, but publishing needs a special permission (Admin &gt; Access &gt; Special permissions).</small>}
          </div>}
        </div>
      )}

      {tab === "preview" && (
        <div style={{ display: "grid", gap: 10, maxWidth: 820 }}>
          <p className="sub" style={{ margin: 0 }}><b>Preview.</b> This is how {who} will read it (revision {d.revision}), signature box and all. It is not published and nobody can sign it.</p>
          <div className="card" style={{ background: "#fff", color: "#111" }}>
            <h2 style={{ marginTop: 0, textAlign: "center" }}>{d.title}</h2>
            <Agreement sections={d.sections.filter((s) => s.heading || s.body)} closing={d.closing} />
            <hr /><p className="sub" style={{ color: "#555" }}>[ Signature box, initials and "I agree" tick appear here ]</p>
          </div>
          <div className="bar"><button onClick={() => setTab("edit")}>Back to editing</button></div>
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
