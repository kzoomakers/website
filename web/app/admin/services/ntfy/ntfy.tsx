"use client";
import { useEffect, useId, useRef, useState } from "react";
import { confirmDialog, promptDialog } from "@/components/dialog";
import "../../../members/profile/toggle.css";
import "./ntfy.css";

type T = { kind: string; owner: string; name: string; description: string; public_read: boolean; public_write: boolean; retention_days: number; builtin: boolean; messages: number; last_message: string | null;
  connections: number; connections_24h: number; connections_7d: number; last_connected: string | null; live: number };
type M = { seq: string; id: string; time: string; title: string; message: string; priority: number; tags: string[]; click: string; sender: string; origin: string };
type C = { id: string; at: string; last_seen: string; closed: boolean; poll: boolean; ua: string; who: string; ip_hash: string; live: boolean };
type K = { owner: string; hash: string; label: string; topics: string[]; scopes: string[]; expires_at: string | null; created_by: string; created_at: string; last_used_at: string | null };
type Tab = "messages" | "clients" | "links";

const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/webmaster/ntfy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
const BLANK = { name: "", description: "", public_read: false, public_write: false, retention_days: 30, existing: false };
const EXPIRES = [["never", "Never"], ["1d", "1 day"], ["1w", "1 week"], ["1m", "1 month"], ["6m", "6 months"], ["1y", "1 year"], ["3y", "3 years"]];
const TABS: [Tab, string][] = [["messages", "Messages"], ["clients", "Clients"], ["links", "Attach"]];

/** The round push switch from the member profile page. */
function Flip({ on, set, label, disabled, hint }: { on: boolean; set: (v: boolean) => void; label: string; disabled?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="nt-flip" data-off={disabled || undefined}>
      <span className="tgl-col"><b aria-hidden className="tgl-state" style={{ color: on ? "#2e9e4f" : "#777" }}>{on ? "ON" : "OFF"}</b>
        <span className="tgl-sw"><span className="round"><input type="checkbox" id={id} checked={on} disabled={disabled} onChange={(e) => set(e.target.checked)} /><div className="back"><label className="but" htmlFor={id}><span className="on">I</span><span className="off">0</span></label></div></span></span></span>
      <label htmlFor={id}>{label}{hint && <small style={{ display: "block", fontWeight: 400, color: "var(--mut)" }}>{hint}</small>}</label>
    </div>
  );
}

export default function Ntfy({ initial }: { initial: T[] }) {
  const [topics, setTopics] = useState(initial), [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null), [form, setForm] = useState(BLANK), [open, setOpen] = useState<{ name: string; tab: Tab } | null>(null);
  const [rows, setRows] = useState<(M | C)[]>([]), [more, setMore] = useState(false), [tokens, setTokens] = useState<K[]>([]), [fresh, setFresh] = useState(""), [find, setFind] = useState("");
  const [tk, setTk] = useState({ label: "", topics: [] as string[], read: true, publish: true, expires: "never" });
  const [base, setBase] = useState(""), [showUsers, setShowUsers] = useState(false), [links, setLinks] = useState<{ dir: string; other: string }[]>([]), [pick, setPick] = useState("");
  const [cfg, setCfg] = useState({ baseUrl: "", upstream: "", upstreamToken: "", hasToken: false, clearToken: false });
  const panel = useRef<HTMLDivElement>(null), formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { setBase(location.origin); rpc("tokens").then(setTokens, () => {}); rpc("config").then((c) => setCfg((x) => ({ ...x, ...c, baseUrl: c.baseUrl || location.origin + "/ntfy" })), () => {}); }, []);
  useEffect(() => { if (!msg?.ok) return; const id = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(id); }, [msg]);
  const run = async (f: () => Promise<unknown>) => { setMsg(null); try { await f(); } catch (e: any) { setMsg({ t: e.message }); } };
  const reload = async () => setTopics(await rpc("topics"));
  const show = (name: string, tab: Tab) => run(async () => {
    setOpen({ name, tab }); setPick(""); setRows([]);
    setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    if (tab === "links") return setLinks(await rpc("links", { name }));
    const r = await rpc(tab, { name }); setRows(r); setMore(tab === "messages" && r.length === 100);
  });
  const link = (add: boolean, source: string, target: string) => run(async () => { await rpc(add ? "addLink" : "removeLink", { source, target }); setLinks(await rpc("links", { name: open!.name })); setPick(""); });
  const saveCfg = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await rpc("saveConfig", { config: cfg }); setMsg({ t: "Saved.", ok: true }); setCfg({ ...cfg, upstreamToken: "", clearToken: false }); }); };
  const older = () => run(async () => { const r = await rpc("messages", { name: open!.name, before: Number((rows[rows.length - 1] as M).seq) }); setRows([...rows, ...r]); setMore(r.length === 100); });
  const save = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await rpc("saveTopic", { topic: form }); setMsg({ t: form.existing ? "Topic saved." : "Topic created.", ok: true }); setForm(BLANK); await reload(); }); };
  const flip = (t: T, p: Partial<T>) => run(async () => { await rpc("saveTopic", { topic: { ...t, ...p, existing: true } }); await reload(); });
  const del = (t: T) => run(async () => { if (await confirmDialog(`Delete topic "${t.name}" with its ${t.messages} message(s)? Apps subscribed to it will stop working.`, { ok: "Delete", danger: true })) { await rpc("deleteTopic", { name: t.name }); setOpen(null); await reload(); } });
  const test = (t: T) => run(async () => { const text = await promptDialog(`Enter text to send to ${t.name}`, "Hello from the admin page", { multiline: true, ok: "Send" }); if (!text?.trim()) return; await rpc("send", { name: t.name, title: "Test", message: text }); setMsg({ t: `Test sent to ${t.name}.`, ok: true }); await reload(); if (open?.name === t.name && open.tab === "messages") await show(t.name, "messages"); });
  const edit = (t: T) => { setForm({ name: t.name, description: t.description, public_read: t.public_read, public_write: t.public_write, retention_days: t.retention_days, existing: true }); formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  const mk = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    const { label, topics, read, publish, expires } = tk;
    setFresh((await rpc("createToken", { token: { label, topics, expires, scopes: [read && "read", publish && "publish"].filter(Boolean) } })).token);
    setTk({ ...tk, label: "", topics: [] }); setTokens(await rpc("tokens"));
  }); };
  const users = topics.filter((t) => t.kind !== "shared").length, shared = topics.length - users;
  const f = find.trim().toLowerCase(), list = topics.filter((t) => (showUsers || t.kind === "shared") && (!f || `${t.name} ${t.description} ${t.owner}`.toLowerCase().includes(f)));
  const sum = (k: "messages" | "live" | "connections_24h") => topics.reduce((a, t) => a + t[k], 0);
  const topicPicks = topics.filter((t) => showUsers || t.kind === "shared");
  return (
    <div className="nt">
      <div className="nt-head"><div><h1>Notifications (ntfy)</h1>
        <p className="sub" style={{ margin: 0, maxWidth: 760 }}>Our own <a href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> server. In the ntfy app set the server to <code>{base}/ntfy</code>, add a subscription, and sign in with any username and an access token as the password. Publish with <code>curl -H "Authorization: Bearer TOKEN" -d "hello" {base}/ntfy/TOPIC</code>.</p></div></div>
      <div className="nt-stats">
        {([[shared, "Shared topics"], [users, "Personal topics"], [sum("messages"), "Messages kept"], [sum("live"), "Connected now"], [sum("connections_24h"), "Connections 24h"]] as const).map(([n, l]) => <div className="nt-stat" key={l}><b>{n}</b><span>{l}</span></div>)}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className="nt-toast" data-ok={msg.ok || undefined} data-bad={!msg.ok || undefined}>{msg.t}</p>}

      <div className="nt-bar">
        <input type="search" aria-label="Find a topic" placeholder="Find a topic…" value={find} onChange={(e) => setFind(e.target.value)} />
        <Flip on={showUsers} set={setShowUsers} label={`Show personal topics (${users})`} hint="Everyone gets one; messages nobody has read for 60 days are deleted." />
      </div>
      <div className="nt-grid">
        {list.map((t) => {
          const personal = t.kind !== "shared";
          return (
            <article key={t.name} className="nt-card" data-open={open?.name === t.name || undefined}>
              <div><h3><span className="nt-dot" data-live={t.live > 0 || undefined} title={t.live ? `${t.live} connected` : "Nobody connected"} />{t.name}</h3>
                <div className="nt-tags" style={{ marginTop: 6 }}>{t.builtin && <span className="nt-pill acc">built in</span>}{personal && <span className="nt-pill">personal · {t.owner}</span>}<span className="nt-pill">kept {t.retention_days} d</span></div></div>
              {t.description && <p>{t.description}</p>}
              <dl className="nt-nums">
                <div><dt>Messages</dt><dd>{t.messages}</dd></div><div><dt>Connected now</dt><dd className={t.live ? "ok" : ""}>{t.live}</dd></div>
                <div><dt>Last message</dt><dd>{when(t.last_message)}</dd></div><div><dt>Last connected</dt><dd>{when(t.last_connected)}</dd></div>
                <div style={{ gridColumn: "1/-1" }}><dt>Connections 24h / 7d / all</dt><dd>{t.connections_24h} / {t.connections_7d} / {t.connections}</dd></div>
              </dl>
              <div className="nt-flips">
                <Flip on={t.public_read} set={(v) => flip(t, { public_read: v })} disabled={personal} label="Anyone can subscribe" />
                <Flip on={t.public_write} set={(v) => flip(t, { public_write: v })} disabled={personal} label="Anyone can publish" />
              </div>
              <div className="nt-acts">
                <span className="seg" role="group" aria-label={`Inspect ${t.name}`}>{TABS.map(([k, l]) => <button key={k} aria-pressed={open?.name === t.name && open.tab === k} onClick={() => show(t.name, k)}>{l}</button>)}</span>
                <span className="spacer" /><button onClick={() => test(t)}>Send test</button><button onClick={() => edit(t)}>Edit</button>
                {!t.builtin && !personal && <button className="danger" onClick={() => del(t)}>Delete</button>}
              </div>
            </article>);
        })}
      </div>
      {!list.length && <p className="nt-empty">{f ? "No topics match." : "No topics yet. Create one below."}</p>}

      {open && (
        <div className="nt-panel" ref={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
            <h2>{open.name}</h2><button aria-label="Close" onClick={() => setOpen(null)}>✕</button></div>
          <span className="seg" role="group" aria-label="View">{TABS.map(([k, l]) => <button key={k} aria-pressed={open.tab === k} onClick={() => show(open.name, k)}>{l === "Attach" ? "Attached topics" : l === "Clients" ? "Client connections" : l}</button>)}</span>
          {open.tab === "links" ? (
            <>
              <p className="sub">Everything published to <strong>{open.name}</strong> is also copied into the topics below, marked with where it came from. Attach a shared topic to people's personal topics so they only subscribe to their own.</p>
              {links.filter((l) => l.dir === "to").map((l) => <div key={l.other} className="nt-item" style={{ gridAutoFlow: "column", justifyContent: "space-between", alignItems: "center" }}><span>→ <strong>{l.other}</strong></span><button className="danger" onClick={() => link(false, open.name, l.other)}>Detach</button></div>)}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}><select aria-label="Topic to attach" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Copy into…</option>
                {topics.filter((t) => t.name !== open.name && !links.some((l) => l.dir === "to" && l.other === t.name)).map((t) => <option key={t.name} value={t.name}>{t.kind !== "shared" ? `${t.name} (${t.owner})` : t.name}</option>)}</select>
                <button className="pri" disabled={!pick} onClick={() => link(true, open.name, pick)}>Attach</button></div>
              {links.some((l) => l.dir === "from") && <p className="sub" style={{ marginTop: 12 }}>Receives copies from: {links.filter((l) => l.dir === "from").map((l) => l.other).join(", ")}</p>}
            </>
          ) : open.tab === "messages" ? (rows as M[]).map((m) => (
            <div key={m.seq} className="nt-item">
              <div className="nt-tags"><span className="nt-pill">{when(m.time)}</span><span className="nt-pill">from {m.sender || "?"}</span>{m.origin && <span className="nt-pill acc">via {m.origin}</span>}{m.priority !== 3 && <span className="nt-pill bad">priority {m.priority}</span>}{m.tags.map((x) => <span key={x} className="nt-pill">{x}</span>)}</div>
              {m.title && <div className="t">{m.title}</div>}<div className="b">{m.message}</div>
            </div>)) : (rows as C[]).map((c) => (
            <div key={c.id} className="nt-item">
              <div className="nt-tags"><span className={"nt-pill " + (c.live ? "ok" : "")}>{c.live ? "● Connected now" : "Disconnected"}</span><span className="nt-pill">since {when(c.at)}</span><span className="nt-pill">last seen {when(c.last_seen)}</span>
                <span className="nt-pill">{c.poll ? "poll" : "stream"}</span><span className="nt-pill">{c.who}</span><span className="nt-pill" title="Hashed address">client {c.ip_hash.slice(0, 8)}</span></div>
              <div className="sub" style={{ margin: 0, overflowWrap: "anywhere" }}>{c.ua}</div>
            </div>))}
          {open.tab !== "links" && !rows.length && <p className="nt-empty">Nothing yet.</p>}
          {more && <p><button onClick={older}>Load older</button></p>}
        </div>
      )}

      <h2>{form.existing ? "Edit topic" : "New topic"}</h2>
      <form ref={formRef} className="nt-form" data-edit={form.existing || undefined} onSubmit={save}>
        <label>Topic name<input required value={form.name} disabled={form.existing} pattern="[-_A-Za-z0-9]{1,64}" title="1-64 letters, numbers, - or _" placeholder="shop-alerts" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Description<input value={form.description} maxLength={300} placeholder="What is this for?" onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>Keep messages (days, 1 to 120)<input type="number" min={1} max={120} value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })} />
          <span className="nt-chips">{[1, 7, 30, 60, 120].map((d) => <button type="button" key={d} aria-pressed={form.retention_days === d} onClick={() => setForm({ ...form, retention_days: d })}>{d} d</button>)}</span></label>
        <div><Flip on={form.public_read} set={(v) => setForm({ ...form, public_read: v })} label="Anyone can subscribe" /><Flip on={form.public_write} set={(v) => setForm({ ...form, public_write: v })} label="Anyone can publish" /></div>
        <div className="acts"><button className="pri">{form.existing ? "Save topic" : "Create topic"}</button>{form.existing && <button type="button" onClick={() => setForm(BLANK)}>Cancel</button>}</div>
      </form>

      <h2>iPhone push</h2>
      <p className="sub">iPhones can't keep a connection open, so Apple only delivers instantly if this server tells an upstream ntfy server (ntfy.sh) that a message arrived. Only a hash of the topic address and the message ID are sent, never the message. Leave the upstream empty to switch this off; iPhones then still get messages, but only after a delay of up to a few hours.</p>
      <form className="nt-form" onSubmit={saveCfg}>
        <label>This server's public address<input value={cfg.baseUrl} placeholder="https://kzoomakers.org/ntfy" onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} /></label>
        <label>Upstream server<input value={cfg.upstream} placeholder="https://ntfy.sh (empty = off)" onChange={(e) => setCfg({ ...cfg, upstream: e.target.value })} /></label>
        <label>Upstream access token <small>({cfg.hasToken && !cfg.clearToken ? "one is saved" : "optional"})</small><input type="password" autoComplete="off" value={cfg.upstreamToken} onChange={(e) => setCfg({ ...cfg, upstreamToken: e.target.value })} /></label>
        <div className="acts"><button className="pri">Save</button>{cfg.hasToken && <Flip on={cfg.clearToken} set={(v) => setCfg({ ...cfg, clearToken: v })} label="Remove saved token" />}</div>
      </form>

      <h2>Access tokens</h2>
      <p className="sub">Phones and scripts use a token to read or publish private topics. Leave all topics unselected for a token that works everywhere. The token is shown once.</p>
      {fresh && <div role="status" className="nt-fresh"><span>New token, copy it now:</span><code>{fresh}</code><button onClick={() => navigator.clipboard?.writeText(fresh).then(() => setMsg({ t: "Copied.", ok: true }))}>Copy</button><button onClick={() => setFresh("")}>Done</button></div>}
      <form className="nt-form" onSubmit={mk}>
        <label>Label<input required value={tk.label} maxLength={80} placeholder="Sam's phone" onChange={(e) => setTk({ ...tk, label: e.target.value })} /></label>
        <label>Expires<select value={tk.expires} onChange={(e) => setTk({ ...tk, expires: e.target.value })} style={{ display: "block", width: "100%", marginTop: 4 }}>{EXPIRES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <div><Flip on={tk.read} set={(v) => setTk({ ...tk, read: v })} label="May read" /><Flip on={tk.publish} set={(v) => setTk({ ...tk, publish: v })} label="May publish" /></div>
        <div className="full"><b style={{ fontSize: 14 }}>Topics</b> <small style={{ color: "var(--mut)" }}>{tk.topics.length ? `${tk.topics.length} selected` : "all topics"}</small>
          <div className="nt-chips">{topicPicks.map((t) => { const on = tk.topics.includes(t.name); return <button type="button" key={t.name} aria-pressed={on} onClick={() => setTk({ ...tk, topics: on ? tk.topics.filter((x) => x !== t.name) : [...tk.topics, t.name] })}>{t.name}</button>; })}</div></div>
        <div className="acts"><button className="pri" disabled={!tk.read && !tk.publish}>Create token</button></div>
      </form>
      <div className="nt-grid">
        {tokens.map((k) => {
          const dead = !!k.expires_at && new Date(k.expires_at) < new Date();
          return (
            <article key={k.hash} className="nt-card" style={dead ? { opacity: .65 } : undefined}>
              <h3>{k.label}</h3>
              <div className="nt-tags">{k.owner && <span className="nt-pill">personal · {k.owner}</span>}<span className="nt-pill acc">{k.scopes.join(" + ")}</span><span className="nt-pill">{k.topics.length ? k.topics.join(", ") : "all topics"}</span>
                {dead ? <span className="nt-pill bad">expired</span> : <span className="nt-pill">{k.expires_at ? `expires ${when(k.expires_at)}` : "never expires"}</span>}</div>
              <dl className="nt-nums"><div><dt>Made</dt><dd>{when(k.created_at)}</dd></div><div><dt>By</dt><dd>{k.created_by}</dd></div><div style={{ gridColumn: "1/-1" }}><dt>Last used</dt><dd>{when(k.last_used_at)}</dd></div></dl>
              <div className="nt-acts"><span className="spacer" /><button className="danger" onClick={() => run(async () => { if (await confirmDialog(`Revoke the token "${k.label}"? Anything using it stops working.`, { ok: "Revoke", danger: true })) { await rpc("deleteToken", { hash: k.hash }); setTokens(await rpc("tokens")); } })}>Revoke</button></div>
            </article>);
        })}
      </div>
      {!tokens.length && <p className="nt-empty">No tokens yet.</p>}
    </div>
  );
}
