"use client";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";

type T = { kind: string; owner: string; name: string; description: string; public_read: boolean; public_write: boolean; retention_days: number; builtin: boolean; messages: number; last_message: string | null;
  connections: number; connections_24h: number; connections_7d: number; last_connected: string | null; live: number };
type M = { seq: string; id: string; time: string; title: string; message: string; priority: number; tags: string[]; click: string; sender: string; origin: string };
type C = { id: string; at: string; last_seen: string; closed: boolean; poll: boolean; ua: string; who: string; ip_hash: string; live: boolean };
type K = { owner: string; hash: string; label: string; topics: string[]; write: boolean; created_by: string; created_at: string; last_used_at: string | null };

const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/webmaster/ntfy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "never");
const BLANK = { name: "", description: "", public_read: false, public_write: false, retention_days: 30, existing: false };

export default function Ntfy({ initial }: { initial: T[] }) {
  const [topics, setTopics] = useState(initial), [msg, setMsg] = useState(""), [form, setForm] = useState(BLANK), [open, setOpen] = useState<{ name: string; tab: "messages" | "clients" | "links" } | null>(null);
  const [rows, setRows] = useState<(M | C)[]>([]), [more, setMore] = useState(false), [tokens, setTokens] = useState<K[]>([]), [tk, setTk] = useState({ label: "", topics: [] as string[], write: true }), [fresh, setFresh] = useState("");
  const [base, setBase] = useState(""), [showUsers, setShowUsers] = useState(false), [links, setLinks] = useState<{ dir: string; other: string }[]>([]), [pick, setPick] = useState("");
  const [cfg, setCfg] = useState({ baseUrl: "", upstream: "", upstreamToken: "", hasToken: false, clearToken: false });
  useEffect(() => { setBase(location.origin); rpc("tokens").then(setTokens, () => {}); rpc("config").then((c) => setCfg((x) => ({ ...x, ...c, baseUrl: c.baseUrl || location.origin + "/ntfy" })), () => {}); }, []);
  const run = async (f: () => Promise<unknown>) => { setMsg(""); try { await f(); } catch (e: any) { setMsg(e.message); } };
  const reload = async () => setTopics(await rpc("topics"));
  const show = (name: string, tab: "messages" | "clients" | "links") => run(async () => {
    setOpen({ name, tab }); setPick("");
    if (tab === "links") return setLinks(await rpc("links", { name }));
    const r = await rpc(tab, { name }); setRows(r); setMore(tab === "messages" && r.length === 100);
  });
  const link = (add: boolean, source: string, target: string) => run(async () => { await rpc(add ? "addLink" : "removeLink", { source, target }); setLinks(await rpc("links", { name: open!.name })); setPick(""); });
  const saveCfg = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await rpc("saveConfig", { config: cfg }); setMsg("Saved."); setCfg({ ...cfg, upstreamToken: "", clearToken: false }); }); };
  const older = () => run(async () => { const r = await rpc("messages", { name: open!.name, before: Number((rows[rows.length - 1] as M).seq) }); setRows([...rows, ...r]); setMore(r.length === 100); });
  const save = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await rpc("saveTopic", { topic: form }); setForm(BLANK); await reload(); }); };
  const del = (t: T) => run(async () => { if (await confirmDialog(`Delete topic "${t.name}" with its ${t.messages} message(s)? Apps subscribed to it will stop working.`, { ok: "Delete", danger: true })) { await rpc("deleteTopic", { name: t.name }); setOpen(null); await reload(); } });
  const test = (t: T) => run(async () => { await rpc("send", { name: t.name, title: "Test", message: "Hello from the admin page" }); await reload(); if (open?.name === t.name) await show(t.name, open.tab); });
  const mk = (e: React.FormEvent) => { e.preventDefault(); run(async () => { setFresh((await rpc("createToken", { token: tk })).token); setTk({ label: "", topics: [], write: true }); setTokens(await rpc("tokens")); }); };
  const access = (t: T) => (t.public_read && t.public_write ? "Public" : t.public_read ? "Public read" : t.public_write ? "Public write" : "Private");
  return (
    <>
      <h1>Notifications (ntfy)</h1>
      <p className="sub">Our own <a href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> server. In the ntfy app (Android/iOS) set the server to <code>{base}/ntfy</code> (<code>/notify</code> works too), add a subscription, and sign in with any username and an access token as the password. Anything can publish with <code>curl -H "Authorization: Bearer TOKEN" -d "hello" {base}/ntfy/TOPIC</code>.</p>
      {msg && <p role="alert" className="sub" style={{ color: "#b3261e" }}>{msg}</p>}
      <label style={{ display: "block", marginBottom: 8 }}><input type="checkbox" checked={showUsers} onChange={(e) => setShowUsers(e.target.checked)} /> Show personal topics ({topics.filter((t) => t.kind === "user").length}). Everyone gets one; messages in one that nobody has read for 60 days are deleted.</label>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left" }}><th>Topic</th><th>Access</th><th>Messages</th><th>Connected now</th><th>Connections 24h / 7d / all</th><th>Last connected</th><th /></tr></thead>
          <tbody>{topics.filter((t) => showUsers || t.kind !== "user").map((t) => (
            <tr key={t.name} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
              <td style={{ padding: "8px 8px 8px 0" }}><strong>{t.name}</strong>{t.builtin && <span className="tag">built in</span>}{t.kind === "user" && <span className="tag">personal · {t.owner}</span>}<div className="sub" style={{ margin: 0 }}>{t.description}</div></td>
              <td>{access(t)}<div className="sub" style={{ margin: 0 }}>kept {t.retention_days} d</div></td>
              <td>{t.messages}<div className="sub" style={{ margin: 0 }}>last {when(t.last_message)}</div></td>
              <td>{t.live}</td><td>{t.connections_24h} / {t.connections_7d} / {t.connections}</td><td>{when(t.last_connected)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button onClick={() => show(t.name, "messages")}>Messages</button> <button onClick={() => show(t.name, "clients")}>Clients</button> <button onClick={() => show(t.name, "links")}>Attach</button> <button onClick={() => test(t)}>Send test</button>{" "}
                <button onClick={() => { setForm({ name: t.name, description: t.description, public_read: t.public_read, public_write: t.public_write, retention_days: t.retention_days, existing: true }); scrollTo({ top: 0 }); }}>Edit</button>
                {!t.builtin && t.kind !== "user" && <> <button className="danger" onClick={() => del(t)}>Delete</button></>}
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={save} style={{ padding: 16, margin: "16px 0", display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <label>Topic name<input required value={form.name} disabled={form.existing} pattern="[-_A-Za-z0-9]{1,64}" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Description<input value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>Keep messages (days)<input type="number" min={1} max={120} value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })} /></label>
        <label><input type="checkbox" checked={form.public_read} onChange={(e) => setForm({ ...form, public_read: e.target.checked })} /> Anyone can subscribe</label>
        <label><input type="checkbox" checked={form.public_write} onChange={(e) => setForm({ ...form, public_write: e.target.checked })} /> Anyone can publish</label>
        <div style={{ alignSelf: "end", display: "flex", gap: 8 }}><button className="pri">{form.existing ? "Save topic" : "Create topic"}</button>{form.existing && <button type="button" onClick={() => setForm(BLANK)}>Cancel</button>}</div>
      </form>

      {open && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 12 }}>{open.name} · {open.tab === "messages" ? "Messages" : open.tab === "links" ? "Attached topics" : "Client connections"}</h2>
          {open.tab === "links" ? (
            <>
              <p className="sub">Everything published to <strong>{open.name}</strong> is also copied into the topics below, marked with where it came from. Attach a shared topic to people's personal topics so they only subscribe to their own.</p>
              {links.filter((l) => l.dir === "to").map((l) => <div key={l.other} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>→ <strong>{l.other}</strong> <button className="danger" onClick={() => link(false, open.name, l.other)}>Detach</button></div>)}
              <p style={{ display: "flex", gap: 8 }}><select aria-label="Topic to attach" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Copy into…</option>
                {topics.filter((t) => t.name !== open.name && !links.some((l) => l.dir === "to" && l.other === t.name)).map((t) => <option key={t.name} value={t.name}>{t.kind === "user" ? `${t.name} (${t.owner})` : t.name}</option>)}</select>
                <button className="pri" disabled={!pick} onClick={() => link(true, open.name, pick)}>Attach</button></p>
              {links.some((l) => l.dir === "from") && <p className="sub">Receives copies from: {links.filter((l) => l.dir === "from").map((l) => l.other).join(", ")}</p>}
            </>
          ) : open.tab === "messages" ? (rows as M[]).map((m) => (
            <div key={m.seq} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <span className="tag">{when(m.time)}</span><span className="tag">from {m.sender || "?"}</span>{m.origin && <span className="tag">via {m.origin}</span>}{m.priority !== 3 && <span className="tag">priority {m.priority}</span>}{m.tags.map((x) => <span key={x} className="tag">{x}</span>)}
              {m.title && <div style={{ fontWeight: 600 }}>{m.title}</div>}<div style={{ whiteSpace: "pre-wrap" }}>{m.message}</div>
            </div>)) : (rows as C[]).map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <span className="tag" style={{ fontWeight: 600 }}>{c.live ? "Connected now" : "Disconnected"}</span><span className="tag">since {when(c.at)}</span><span className="tag">last seen {when(c.last_seen)}</span>
              <span className="tag">{c.poll ? "poll" : "stream"}</span><span className="tag">{c.who}</span><span className="tag" title="Hashed address">client {c.ip_hash.slice(0, 8)}</span><div className="sub" style={{ margin: 0 }}>{c.ua}</div>
            </div>))}
          {open.tab !== "links" && !rows.length && <p className="sub">Nothing yet.</p>}
          {more && <p><button onClick={older}>Load older</button></p>}
        </div>
      )}

      <h2>iPhone push</h2>
      <p className="sub">iPhones can't keep a connection open, so Apple only delivers instantly if this server tells an upstream ntfy server (ntfy.sh) that a message arrived. Only a hash of the topic address and the message ID are sent, never the message. Leave the upstream empty to switch this off; iPhones then still get messages, but only after a delay of up to a few hours.</p>
      <form className="card" onSubmit={saveCfg} style={{ padding: 16, marginBottom: 16, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        <label>This server's public address<input value={cfg.baseUrl} placeholder="https://kzoomakers.org/ntfy" onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} /></label>
        <label>Upstream server<input value={cfg.upstream} placeholder="https://ntfy.sh (empty = off)" onChange={(e) => setCfg({ ...cfg, upstream: e.target.value })} /></label>
        <label>Upstream access token <small>({cfg.hasToken && !cfg.clearToken ? "one is saved" : "optional"})</small><input type="password" autoComplete="off" value={cfg.upstreamToken} onChange={(e) => setCfg({ ...cfg, upstreamToken: e.target.value })} /></label>
        <div style={{ alignSelf: "end" }}><button className="pri">Save</button> {cfg.hasToken && <label><input type="checkbox" checked={cfg.clearToken} onChange={(e) => setCfg({ ...cfg, clearToken: e.target.checked })} /> remove saved token</label>}</div>
      </form>

      <h2>Access tokens</h2>
      <p className="sub">Phones and scripts use a token to read or publish private topics. Leave all topics unticked for a token that works everywhere. The token is shown once.</p>
      {fresh && <p role="status" className="card" style={{ padding: 12 }}>New token (copy it now): <code style={{ userSelect: "all" }}>{fresh}</code></p>}
      <form className="card" onSubmit={mk} style={{ padding: 16, marginBottom: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label>Label<input required value={tk.label} maxLength={80} placeholder="Sam's phone" onChange={(e) => setTk({ ...tk, label: e.target.value })} /></label>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend>Topics</legend>{topics.map((t) => <label key={t.name} style={{ marginRight: 12 }}><input type="checkbox" checked={tk.topics.includes(t.name)} onChange={(e) => setTk({ ...tk, topics: e.target.checked ? [...tk.topics, t.name] : tk.topics.filter((x) => x !== t.name) })} /> {t.name}</label>)}</fieldset>
        <label><input type="checkbox" checked={tk.write} onChange={(e) => setTk({ ...tk, write: e.target.checked })} /> May publish</label>
        <button className="pri">Create token</button>
      </form>
      <div className="card">
        {tokens.map((k) => (
          <div key={k.hash} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <strong>{k.label}</strong>{k.owner && <span className="tag">personal · {k.owner}</span>} <span className="tag">{k.topics.length ? k.topics.join(", ") : "all topics"}</span><span className="tag">{k.write ? "read + publish" : "read only"}</span>
            <span className="tag">made {when(k.created_at)} by {k.created_by}</span><span className="tag">last used {when(k.last_used_at)}</span>{" "}
            <button className="danger" onClick={() => run(async () => { if (await confirmDialog(`Revoke the token "${k.label}"? Anything using it stops working.`, { ok: "Revoke", danger: true })) { await rpc("deleteToken", { hash: k.hash }); setTokens(await rpc("tokens")); } })}>Revoke</button>
          </div>))}
        {!tokens.length && <p className="sub">No tokens yet.</p>}
      </div>
    </>
  );
}
