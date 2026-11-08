"use client";
import { useCallback, useEffect, useState } from "react";
import { alertDialog } from "@/components/dialog";
import { crm } from "../../rpc";
import type { Auth } from "@/lib/crm";

type D = { levels: { level: string }[]; auths: Auth[]; skills: { optin: boolean; bio: string; skills: { name: string; level: string }[] }; classes: { id: number; title: string; starts_at: string }[]; tools: { id: number; name: string; category: string }[]; plans: string[] };

// Membership levels (the plans on the Pricing page), tool authorizations, and what this person lists / has signed up for.
export default function Extras({ id, canEdit }: { id: number; canEdit: boolean }) {
  const [d, setD] = useState<D | null>(null), [tool, setTool] = useState(""), [exp, setExp] = useState(""), [note, setNote] = useState("");
  const load = useCallback(() => crm<D>("member", { id }).then(setD, (e) => alertDialog(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="sub">Loading…</p>;
  const held = d.levels.map((l) => l.level), all = [...new Set([...d.plans, ...held])];
  const toggle = (l: string) => crm("setLevels", { id, levels: held.includes(l) ? held.filter((x) => x !== l) : [...held, l] }).then(load, (e) => alertDialog(e.message));
  return (
    <>
      <h2>Membership</h2>
      <div className="card" style={{ padding: 16 }}>
        {all.map((l) => <label key={l} style={{ display: "block", padding: "4px 0" }}><input type="checkbox" disabled={!canEdit} checked={held.includes(l)} onChange={() => toggle(l)} /> {l}{!d.plans.includes(l) && <span className="tag"> no longer on the Pricing page</span>}</label>)}
        {!all.length && <p className="sub">The Pricing page has no plans yet.</p>}
        <p className="sub" style={{ margin: "8px 0 0" }}>Levels come from the plans on the Pricing page (Website → Guided → Learn More → Pricing).</p>
      </div>

      <h2>Tool authorizations</h2>
      <div className="card">
        {d.auths.map((a) => (
          <div className="row" key={a.tool_id}>
            <span className="grow">{a.name}</span>{a.category && <span className="tag">{a.category}</span>}
            {a.expires_on && <span className="tag" style={a.expired ? { color: "var(--bad)" } : undefined}>{a.expired ? "expired" : "until"} {a.expires_on}</span>}
            {a.note && <span className="tag">{a.note}</span>}<span className="tag">by {a.granted_by}</span>
            {canEdit && <button onClick={() => crm("revoke", { id, tool: a.tool_id }).then(load, (e) => alertDialog(e.message))}>Revoke</button>}
          </div>
        ))}
        {!d.auths.length && <p className="sub">None yet.</p>}
      </div>
      {canEdit && (
        <form className="bar" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); crm("grant", { id, tool: Number(tool), expires: exp || null, note }).then(() => { setTool(""); setExp(""); setNote(""); load(); }, (x) => alertDialog(x.message)); }}>
          <select required aria-label="Tool" value={tool} onChange={(e) => setTool(e.target.value)}><option value="">Authorize on a tool…</option>{d.tools.map((t) => <option key={t.id} value={t.id}>{t.category ? `${t.category}: ` : ""}{t.name}</option>)}</select>
          <input type="date" aria-label="Expires (optional)" title="Expires (optional)" value={exp} onChange={(e) => setExp(e.target.value)} />
          <input aria-label="Note" placeholder="Note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="pri">Grant</button>
        </form>
      )}
      {!d.tools.length && <p className="sub">No tools exist yet. Add some under Tools.</p>}

      <h2>Skills &amp; classes</h2>
      <div className="card" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}><strong>Directory:</strong> {d.skills.optin ? "listed" : "not listed"}{d.skills.bio && <> · “{d.skills.bio}”</>}</p>
        <p style={{ margin: "6px 0 0" }}>{d.skills.skills.length ? d.skills.skills.map((s) => `${s.name} (${s.level})`).join(", ") : "No skills added."}</p>
        <p style={{ margin: "6px 0 0" }}><strong>Classes:</strong> {d.classes.length ? d.classes.map((c) => `${c.title} (${new Date(c.starts_at).toLocaleDateString()})`).join(", ") : "none"}</p>
      </div>
    </>
  );
}
