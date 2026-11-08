"use client";
import { useEffect, useState } from "react";

type Info = { email: string; topic: string; sources: string[]; tokens: { hash: string; label: string; expires_at: string | null; created_at: string; last_used_at: string | null }[] };
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "never");

// Everything for you (tour bookings and so on) arrives in ONE topic; subscribe to it in the free ntfy app.
export default function Mine() {
  const [info, setInfo] = useState<Info | null>(null), [label, setLabel] = useState(""), [expires, setExpires] = useState("never"), [fresh, setFresh] = useState(""), [err, setErr] = useState(""), [base, setBase] = useState("");
  const load = () => fetch("/api/account/ntfy").then((r) => (r.ok ? r.json() : Promise.reject())).then(setInfo, () => setErr("Couldn't load your settings."));
  useEffect(() => { setBase(location.origin + "/ntfy"); load(); }, []);
  const make = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const r = await fetch("/api/account/ntfy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, expires }) });
    if (!r.ok) return setErr(await r.text());
    setFresh((await r.json()).token); setLabel(""); load();
  };
  const revoke = async (hash: string) => { await fetch("/api/account/ntfy?hash=" + hash, { method: "DELETE" }); load(); };
  if (!info) return <p role={err ? "alert" : undefined}>{err || "Loading…"}</p>;
  return (
    <>
      <p>Get alerts on your phone with the free <strong>ntfy</strong> app (<a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy">Android</a>, <a href="https://apps.apple.com/app/ntfy/id1625396347">iPhone</a>). Everything meant for you arrives in one personal topic, so there is just one thing to subscribe to.</p>
      <ol>
        <li>Install the app, tap <strong>+</strong>, and turn on <em>Use another server</em>.</li>
        <li>Server: <code style={{ userSelect: "all" }}>{base}</code></li>
        <li>Topic: <code style={{ userSelect: "all" }}>{info.topic}</code></li>
        <li>Tokens below can only <em>send</em> messages to your topic (for scripts and apps), not read them.</li>
      </ol>
      {info.sources.length > 0 && <p>Currently delivered to you: {info.sources.map((s) => <code key={s} style={{ marginRight: 8 }}>{s}</code>)}</p>}
      {fresh && <p role="status" style={{ background: "#fff6e0", padding: 12, borderRadius: 8 }}>Your new token (copy it now, it is only shown once): <code style={{ userSelect: "all" }}>{fresh}</code></p>}
      <form onSubmit={make} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. My phone" aria-label="Token label" maxLength={80} required style={{ flex: "1 1 220px" }} />
        <select value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Expires">
          {[["never", "Never expires"], ["1d", "1 day"], ["1w", "1 week"], ["1m", "1 month"], ["6m", "6 months"], ["1y", "1 year"], ["3y", "3 years"]].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
        <button className="btn btn-main">Make a token</button>
      </form>
      {err && <p role="alert" style={{ color: "#b3261e" }}>{err}</p>}
      {info.tokens.map((t) => <p key={t.hash}><strong>{t.label}</strong> · made {when(t.created_at)} · expires {t.expires_at ? when(t.expires_at) : "never"} · last used {when(t.last_used_at)} <button className="btn" onClick={() => revoke(t.hash)}>Revoke</button></p>)}
    </>
  );
}
