"use client";
import { useState } from "react";
import type { adminView } from "@/lib/ai";

type View = Awaited<ReturnType<typeof adminView>>;
const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/webmaster/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const area = { width: "100%", boxSizing: "border-box", font: "13px/1.4 ui-monospace,monospace" } as const;
const usd = (p?: number) => (p == null ? "" : p < 0.005 ? " · free" : ` · $${p.toFixed(2)}/M in`);

// Step 1: give each AI service its API token and let it find its models. Step 2: pick which service + model does each job.
export default function Ai({ initial, canEdit }: { initial: View; canEdit: boolean }) {
  const [v, setV] = useState(initial), [msg, setMsg] = useState(""), [busy, setBusy] = useState(""), [keys, setKeys] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Record<string, { provider: string; model: string }>>(Object.fromEntries(initial.scenarios.map((s) => [s.id, s.use ?? { provider: "", model: "" }])));
  const [seo, setSeo] = useState(initial.prompts.seo), [base, setBase] = useState(initial.prompts.base), [tones, setTones] = useState(Object.fromEntries(initial.prompts.tones.map((t) => [t.id, t.text])));
  const run = async (tag: string, fn: () => Promise<unknown>, ok: string) => { setBusy(tag); setMsg(""); try { const r = await fn(); setV(await rpc("view")); setMsg(typeof r === "string" ? r : ok); } catch (e: any) { setMsg(e.message); } setBusy(""); };
  return (
    <div style={{ maxWidth: 820 }}>
      <h1>AI</h1>
      <p className="sub">Optional helpers that write plain-language text for staff to review. Add a service's API token, let it find its models, then choose which model does each job. A feature only appears for staff once its model is chosen here. Only free models or models costing $0.06 per million tokens or less are offered, cheapest first.</p>
      {msg && <p role="status" className="sub">{msg}</p>}

      <h2>1. Services</h2>
      {v.providers.map((p) => (
        <section key={p.id} className="card" style={{ padding: 14, marginBottom: 12 }}>
          <strong>{p.name}</strong> {p.hasKey ? <span className="tag">✓ token saved{p.viaMail ? " (from Postmaster settings)" : ""}</span> : <span className="tag">no token</span>}
          {p.models.length > 0 && <span className="tag">{p.models.length} models found</span>}
          <p className="sub" style={{ margin: "6px 0" }}>Get a token at <a href={p.keysUrl} target="_blank" rel="noreferrer">{p.keysUrl.replace("https://", "")}</a>. It is stored encrypted and never shown again.</p>
          {canEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="password" autoComplete="off" aria-label={`${p.name} API token`} placeholder={p.hasKey ? "Paste a new token to replace it" : "sk-…"} value={keys[p.id] ?? ""} onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })} style={{ flex: "1 1 260px" }} />
              <button disabled={!keys[p.id] || !!busy} onClick={() => run(p.id, async () => { await rpc("saveKey", { provider: p.id, key: keys[p.id] }); setKeys({ ...keys, [p.id]: "" }); await rpc("discover", { provider: p.id }); }, "Token saved and models found.")}>{busy === p.id ? "Working…" : "Save token & find models"}</button>
              {p.hasKey && <button disabled={!!busy} onClick={() => run(p.id, () => rpc("discover", { provider: p.id }), "Model list refreshed.")}>Refresh models</button>}
              {p.hasKey && !p.viaMail && <button className="danger" disabled={!!busy} onClick={() => run(p.id, () => rpc("saveKey", { provider: p.id, key: "-" }), "Token removed.")}>Remove token</button>}
            </div>
          )}
        </section>
      ))}

      <h2>2. Jobs</h2>
      {v.scenarios.map((s) => {
        const c = pick[s.id], ready = v.providers.filter((p) => p.hasKey && p.models.length), models = v.providers.find((p) => p.id === c.provider)?.models ?? [], m = models.find((x) => x.id === c.model);
        return (
          <section key={s.id} className="card" style={{ padding: 14, marginBottom: 12 }}>
            <strong>{s.label}</strong> {s.use ? <span className="tag">on: {s.use.model}</span> : <span className="tag">off</span>}
            <p className="sub" style={{ margin: "6px 0" }}>{s.hint}</p>
            {!ready.length ? <p className="sub">Add a token above and find models first.</p> : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select aria-label="Service" disabled={!canEdit} value={c.provider} onChange={(e) => setPick({ ...pick, [s.id]: { provider: e.target.value, model: "" } })}>
                  <option value="">Off</option>{ready.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {c.provider && <>
                  <input list={`m-${s.id}`} aria-label="Model" disabled={!canEdit} placeholder="Start typing to search models" value={c.model} onChange={(e) => setPick({ ...pick, [s.id]: { ...c, model: e.target.value } })} style={{ flex: "1 1 280px" }} />
                  <datalist id={`m-${s.id}`}>{models.map((x) => <option key={x.id} value={x.id}>{x.name}{usd(x.price)}</option>)}</datalist>
                </>}
                {canEdit && <button className="pri" disabled={!!busy || (!!c.provider && !m)} onClick={() => run(s.id, () => rpc("saveScenario", { id: s.id, ...c }), c.provider ? "Saved." : "Turned off.")}>Save</button>}
                {canEdit && s.use && <button disabled={!!busy} onClick={() => run("t" + s.id, async () => "It works. The model replied: " + (await rpc("test", { id: s.id })).text, "")}>Test</button>}
                {c.provider && c.model && !m && <span className="sub">Pick a model from the list.</span>}
                {m && m.price != null && <span className="sub">{usd(m.price).slice(3)}</span>}
              </div>
            )}
          </section>
        );
      })}

      <h2>3. Writing prompts</h2>
      <p className="sub">The blog style below is used by "Enhance with AI" in the blog editor. The style rules apply to every personality; each personality adds its own voice. Blank restores the default.</p>
      <section className="card" style={{ padding: 14, marginBottom: 12 }}>
        <strong>Style rules (all personalities)</strong>
        <textarea rows={9} aria-label="Style rules" maxLength={6000} disabled={!canEdit} value={base} onChange={(e) => setBase(e.target.value)} style={area} />
        {v.prompts.tones.map((t) => (
          <div key={t.id} style={{ marginTop: 10 }}>
            <strong>{t.label}</strong>
            <textarea rows={4} aria-label={`${t.label} personality`} maxLength={6000} disabled={!canEdit} value={tones[t.id]} onChange={(e) => setTones({ ...tones, [t.id]: e.target.value })} style={area} />
          </div>
        ))}
        <div style={{ marginTop: 14 }}>
          <strong>4. Page editor: Suggest with AI</strong>
          <p className="sub">Rules for the description, AI summary and FAQs the page editor suggests. The answer format is fixed and added automatically.</p>
          <textarea rows={8} aria-label="Page suggestion rules" maxLength={6000} disabled={!canEdit} value={seo} onChange={(e) => setSeo(e.target.value)} style={area} />
        </div>
        {canEdit && <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="pri" disabled={!!busy} onClick={() => run("prompts", () => rpc("savePrompts", { base, tones, seo }), "Prompts saved.")}>Save prompts</button>
          <button disabled={!!busy} onClick={() => { setBase(v.prompts.defaultBase); setSeo(v.prompts.defaultSeo); setTones(Object.fromEntries(v.prompts.tones.map((t) => [t.id, t.defaultText]))); }}>Reset to defaults</button>
        </div>}
      </section>
    </div>
  );
}
