"use client";
import { useEffect, useState } from "react";
import { confirmDialog, promptDialog } from "@/components/dialog";

type Info = { email: string; topic: string; extras: string[]; sources: string[]; tokens: { hash: string; label: string; scopes: string[]; topics: string[]; expires_at: string | null; created_at: string; last_used_at: string | null }[] };
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "never");

// Everything for you (tour bookings and so on) arrives in ONE topic; subscribe to it in the free ntfy app.
export default function Mine() {
  const [info, setInfo] = useState<Info | null>(null), [label, setLabel] = useState(""), [expires, setExpires] = useState("never"), [fresh, setFresh] = useState(""), [scopes, setScopes] = useState({ read: true, publish: true }), [pick, setPick] = useState<string[]>([]), [newName, setNewName] = useState(""), [note, setNote] = useState(""), [err, setErr] = useState(""), [base, setBase] = useState("");
  const load = () => fetch("/api/account/ntfy").then((r) => (r.ok ? r.json() : Promise.reject())).then(setInfo, () => setErr("Couldn't load your settings."));
  useEffect(() => { setBase(location.origin + "/ntfy"); load(); }, []);
  const post = async (body: object) => {
    setErr(""); setNote("");
    const r = await fetch("/api/account/ntfy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { setErr(await r.text()); return null; }
    return r.json();
  };
  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    const j = await post({ label, expires, topics: pick, scopes: (["read", "publish"] as const).filter((k) => scopes[k]) });
    if (j) { setFresh(j.token); setLabel(""); load(); }
  };
  const addTopic = async (e: React.FormEvent) => { e.preventDefault(); if (await post({ op: "addTopic", name: newName })) { setNewName(""); load(); } };
  const dropTopic = async (name: string) => { if (await confirmDialog(`Delete the topic "${name}" and its messages?`, { ok: "Delete", danger: true }) && await post({ op: "deleteTopic", name })) { setPick((p) => p.filter((x) => x !== name)); load(); } };
  const test = async (name: string) => {
    const message = await promptDialog(`Enter text to send to ${name}`, "Hello from my notifications page", { multiline: true, ok: "Send" });
    if (message?.trim() && await post({ op: "test", name, message })) setNote(`Test sent to ${name}.`);
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
        <li>Tokens below let a script or app read and/or send messages on the topics you choose.</li>
      </ol>
      <h3>Your topics</h3>
      {[info.topic, ...info.extras].map((t) => <p key={t}><code style={{ userSelect: "all" }}>{t}</code> <button className="btn" onClick={() => test(t)}>Send test</button>{t !== info.topic && <> <button className="btn" onClick={() => dropTopic(t)}>Delete</button></>}</p>)}
      <form onSubmit={addTopic} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
        <code>{info.topic}-</code><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name" aria-label="New topic name" pattern="[A-Za-z0-9_\-]{1,30}" title="Letters, numbers, - or _" maxLength={30} required />
        <button className="btn">Add topic</button>
      </form>
      {note && <p role="status">{note}</p>}
      {info.sources.length > 0 && <p>Currently delivered to you: {info.sources.map((s) => <code key={s} style={{ marginRight: 8 }}>{s}</code>)}</p>}
      {fresh && <p role="status" style={{ background: "#fff6e0", padding: 12, borderRadius: 8 }}>Your new token (copy it now, it is only shown once): <code style={{ userSelect: "all" }}>{fresh}</code></p>}
      <form onSubmit={make} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. My phone" aria-label="Token label" maxLength={80} required style={{ flex: "1 1 220px" }} />
        <select value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Expires">
          {[["never", "Never expires"], ["1d", "1 day"], ["1w", "1 week"], ["1m", "1 month"], ["6m", "6 months"], ["1y", "1 year"], ["3y", "3 years"]].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
        <label><input type="checkbox" checked={scopes.read} onChange={(e) => setScopes({ ...scopes, read: e.target.checked })} /> Read</label>
        <label><input type="checkbox" checked={scopes.publish} onChange={(e) => setScopes({ ...scopes, publish: e.target.checked })} /> Write</label>
        {[info.topic, ...info.extras].map((t) => <label key={t}><input type="checkbox" checked={pick.includes(t)} onChange={(e) => setPick(e.target.checked ? [...pick, t] : pick.filter((x) => x !== t))} /> {t}</label>)}
        <button className="btn btn-main" disabled={!scopes.read && !scopes.publish}>Make a token</button>
      </form>
      <p style={{ marginTop: -8, fontSize: 13 }}>No topic ticked = your main topic only.</p>
      {err && <p role="alert" style={{ color: "#b3261e" }}>{err}</p>}
      {info.tokens.map((t) => <p key={t.hash}><strong>{t.label}</strong> · {t.scopes?.join(" + ")} on {t.topics?.join(", ")} · made {when(t.created_at)} · expires {t.expires_at ? when(t.expires_at) : "never"} · last used {when(t.last_used_at)} <button className="btn" onClick={() => revoke(t.hash)}>Revoke</button></p>)}
    </>
  );
}
