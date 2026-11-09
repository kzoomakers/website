"use client";
import Notice from "@/components/notice";
import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";

type Row = { id: number; at: string; stream: string; level: string; message: string; data: any };
type State = { streams: Record<string, string>; on: Record<string, boolean>; rows: Row[] };

// Switch a stream on and its traffic is trapped here (and printed to the server's stdout) until you switch it off.
export default function Debug({ canEdit }: { canEdit: boolean }) {
  const [s, setS] = useState<State | null>(null), [stream, setStream] = useState(""), [live, setLive] = useState(true), [err, setErr] = useState("");
  const load = useCallback(() => fetch("/api/webmaster/debug?stream=" + stream, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setS, () => setErr("Couldn't load.")), [stream]);
  useEffect(() => { load(); if (!live) return; const t = setInterval(load, 3000); return () => clearInterval(t); }, [load, live]);
  const post = async (body: object) => { setErr(""); const r = await fetch("/api/webmaster/debug", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) setErr(await r.text()); await load(); };
  if (!s) return <p>{err || "Loading…"}</p>;
  return (
    <>
      <h1>Debug</h1>
      <p className="sub">Turn a stream on to trap its traffic. Lines are shown below (newest first; the last 2,000 per stream are kept, 200 for AI streams because they hold whole prompts and replies) and also printed to the server log. Turn it off when you're done: nothing is recorded while a stream is off, except errors, which always go to the server log.</p>
      <div className="card">
        {Object.entries(s.streams).map(([k, d]) => (
          <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0" }}>
            <input type="checkbox" disabled={!canEdit} checked={!!s.on[k]} onChange={(e) => { const on = e.target.checked; setS((x: any) => x && { ...x, on: { ...x.on, [k]: on } }); post({ op: "set", stream: k, on }); }} />
            <span><span className="tag">{k}</span> {d}{s.on[k] && <strong style={{ color: "var(--bad)" }}> · recording</strong>}</span>
          </label>
        ))}
      </div>
      <nav className="bar">
        <select value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Stream"><option value="">All streams</option>{Object.keys(s.streams).map((k) => <option key={k}>{k}</option>)}</select>
        <label><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live refresh</label>
        <button onClick={load}>Refresh</button>
        {canEdit && <button onClick={async () => { if (await confirmDialog("Clear the trapped lines?", { ok: "Clear", danger: true })) post({ op: "clear", stream }); }}>Clear</button>}
        {err && <Notice kind="error">{err}</Notice>}
      </nav>
      <div className="card" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
        {s.rows.map((r) => (
          <details key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "5px 0" }}>
            <summary style={{ cursor: "pointer", color: r.level === "error" ? "var(--bad)" : undefined }}>{new Date(r.at).toLocaleTimeString()} <span className="tag">{r.stream}</span> {r.message}{r.data?.to ? ` → ${r.data.to}` : ""}{r.data?.status ? ` (${r.data.status})` : ""}{r.data?.ms !== undefined ? ` ${r.data.ms}ms` : ""}</summary>
            <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{JSON.stringify(r.data, null, 2)}</pre>
          </details>
        ))}
        {!s.rows.length && <p className="sub" style={{ fontFamily: "inherit" }}>Nothing trapped yet. {Object.values(s.on).some(Boolean) ? "Trigger an email and it will appear here." : "Switch a stream on above."}</p>}
      </div>
    </>
  );
}
