"use client";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";

type K = { hash: string; label: string; scopes: string[]; expires_at: string | null; created_by: string; created_at: string; last_used_at: string | null };
const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/webmaster/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
const EXPIRES = [["never", "Never"], ["1m", "1 month"], ["6m", "6 months"], ["1y", "1 year"]];

// Scoped API keys for other systems, such as YAMNet reading chores. A key can do only what its scopes say; it is shown once.
export default function ApiKeys({ canEdit }: { canEdit: boolean }) {
  const [keys, setKeys] = useState<K[]>([]), [scopes, setScopes] = useState<Record<string, string>>({}), [f, setF] = useState({ label: "", scopes: ["chores:read", "chores:write"], expires: "never" }), [fresh, setFresh] = useState(""), [err, setErr] = useState("");
  const load = async () => { const r = await rpc("list"); setKeys(r.keys); setScopes(r.scopes); };
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);
  const run = async (fn: () => Promise<void>) => { setErr(""); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } };
  const make = (e: React.FormEvent) => { e.preventDefault(); run(async () => { setFresh((await rpc("create", { key: f })).key); setF({ ...f, label: "" }); }); };
  const del = async (k: K) => { if (await confirmDialog(`Delete the key "${k.label}"? Whatever uses it will stop working immediately.`, { ok: "Delete key", danger: true })) run(() => rpc("delete", { hash: k.hash, label: k.label })); };
  return (
    <section>
      <h1>API keys</h1>
      <p className="sub">Let another system use part of this site, with only the access you tick. A key is shown once, right after you make it.</p>
      <details style={{ margin: "0 0 16px" }}><summary>Setting up YAMNet</summary><p>Make a key with both chores boxes ticked, then paste it into YAMNet's Settings › System as <code>CHORES_API_KEY</code>, and put this site's address in <code>CHORES_API_URL</code>.</p></details>
      {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}
      {fresh && <div className="card" role="status"><strong>Copy this key now. It can't be shown again.</strong><br /><code style={{ wordBreak: "break-all", userSelect: "all" }}>{fresh}</code> <button onClick={() => navigator.clipboard?.writeText(fresh)}>Copy</button> <button onClick={() => setFresh("")}>Done</button></div>}
      {canEdit && (
        <form className="card" onSubmit={make} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label>Label<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={80} placeholder="YAMNet at the space" required style={{ minWidth: 240 }} /></label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sub" style={{ margin: 0 }}>May</legend>
            {Object.entries(scopes).map(([s, l]) => <label key={s} style={{ display: "block" }}><input type="checkbox" checked={f.scopes.includes(s)} onChange={(e) => setF({ ...f, scopes: e.target.checked ? [...f.scopes, s] : f.scopes.filter((x) => x !== s) })} /> {l}</label>)}
          </fieldset>
          <label>Lasts<select value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })}>{EXPIRES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <button className="primary">Make key</button>
        </form>
      )}
      <div className="card">
        {keys.map((k) => (
          <div key={k.hash} style={{ padding: "8px 0", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <strong>{k.label}</strong>{k.scopes.map((s) => <span className="tag" key={s}>{s}</span>)}
            <span className="tag">{k.expires_at ? (new Date(k.expires_at) < new Date() ? "expired " : "expires ") + when(k.expires_at) : "never expires"}</span>
            <span className="tag">Last used: {when(k.last_used_at)}</span><span className="tag">Made by {k.created_by}</span>
            <span style={{ flex: 1 }} />
            {canEdit && <button className="danger" onClick={() => del(k)}>Delete</button>}
          </div>
        ))}
        {!keys.length && <p className="sub">No API keys yet.</p>}
      </div>
    </section>
  );
}
