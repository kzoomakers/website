"use client";
import { useState } from "react";
import Notice from "@/components/notice";

type View = { hasToken: boolean; groups: Record<string, boolean> };
type Row = { id: string; at: string; channel: string; title: string; message: string; status: string; error: string; sender: string };
const CHANNELS: [string, string][] = [
  ["tours", "Tour activity (cancellations, requests, replies, check-in answers)"], ["booked", "A tour is booked"], ["walkup_new", "A walk-up request is created"],
  ["walkup_taken", "A volunteer takes a walk-up request"], ["walkup_stale", "A walk-up request is still untaken after a few days"],
  ["ga", "Traffic spikes and drops from Google Analytics"], ["pii", "PII access alerts (bulk viewing, a non-admin opening a Gov ID)"],
];
const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/webmaster/pushover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// One Pushover application token, one Delivery Group key per alert. Keys are write-only: a saved one shows as "saved" and a blank box keeps it.
export default function Pushover({ initial, log }: { initial: View; log: Row[] }) {
  const [v, setV] = useState(initial), [rows, setRows] = useState(log), [token, setToken] = useState(""), [keys, setKeys] = useState<Record<string, string>>({}), [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const run = async (f: () => Promise<unknown>) => { setMsg(null); try { await f(); } catch (e: any) { setMsg({ t: e.message }); } };
  const save = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    setV(await rpc("save", { config: { token, groups: keys } })); setToken(""); setKeys({}); setMsg({ t: "Saved.", ok: true });
  }); };
  const test = (c: string) => run(async () => { await rpc("test", { channel: c }); setMsg({ t: "Test sent. Check the Pushover app.", ok: true }); setRows(await rpc("log")); });
  return (
    <>
      <h1>Alert delivery</h1>
      <p className="sub">Alerts are sent with <a href="https://pushover.net" target="_blank" rel="noreferrer">Pushover</a>. Create an application on pushover.net and paste its token, then make a <strong>Delivery Group</strong> for each alert and paste its group key. Staff install the Pushover app and are added to the groups they want on pushover.net.</p>
      {msg && <Notice kind={msg.ok ? "success" : "error"}>{msg.t}</Notice>}
      <form onSubmit={save} className="card" style={{ padding: 14, marginBottom: 16 }}>
        <p><label><strong>Application token</strong> {v.hasToken && <em>(saved)</em>}<br /><input value={token} onChange={(e) => setToken(e.target.value)} placeholder={v.hasToken ? "Leave blank to keep the saved token" : "30 letters and numbers"} autoComplete="off" style={{ width: "100%", maxWidth: 420 }} /></label></p>
        {CHANNELS.map(([c, name]) => (
          <p key={c}><label><strong>{name}</strong> {v.groups[c] && <em>(saved)</em>}<br />
            <input value={keys[c] ?? ""} onChange={(e) => setKeys({ ...keys, [c]: e.target.value })} placeholder={v.groups[c] ? "Leave blank to keep it, or type clear to remove it" : "Delivery Group key"} autoComplete="off" style={{ width: "100%", maxWidth: 420 }} /></label>{" "}
            <button type="button" disabled={!v.groups[c] || !v.hasToken} onClick={() => test(c)}>Send test</button></p>
        ))}
        <button>Save</button>
      </form>
      <h2>Recent alerts</h2>
      {!rows.length && <p className="sub">Nothing sent yet.</p>}
      {rows.map((r) => <p key={r.id} style={{ margin: "6px 0" }}><strong>{r.title || "(no title)"}</strong> · {r.channel} · <span style={{ color: r.status === "sent" ? "#2e9e4f" : "#b3261e" }}>{r.status}</span> · {when(r.at)}{r.error && <> · {r.error}</>}<br /><span className="sub">{r.message}</span></p>)}
    </>
  );
}
