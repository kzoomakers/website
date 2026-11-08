"use client";
import { useCallback, useEffect, useState } from "react";

type Row = { id: string; at: string; ip: string; user: string; method: string; host: string; path: string; query: string; ua: string; referer: string; status: number };
type Top = { v: string | null; n: number }[];
type Data = { rows: Row[]; total: number; uniq: { ips: number; users: number }; buckets: { t: string; n: number; s2: number; s3: number; s4: number; s5: number }[]; top: Record<"path" | "ip" | "user" | "ua" | "referer" | "method" | "host" | "status", Top> };
const RANGES: [string, number][] = [["Last 15 minutes", 9e5], ["Last hour", 36e5], ["Last 24 hours", 864e5], ["Last 7 days", 7 * 864e5], ["Last 30 days", 30 * 864e5], ["Last 90 days", 90 * 864e5]];
const PAGE = 100;
const SEC: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400 };
// Bucket size that gives a readable graph (roughly 20-400 bars) for the window being looked at.
const unitFor = (span: number) => (span <= 15 * 60e3 ? "second" : span <= 6 * 36e5 ? "minute" : span <= 4 * 864e5 ? "hour" : "day");
const fmt = (n: number) => (n >= 10 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
const FILTER_KEYS = { path: "Path", ip: "IP", user: "User", method: "Method", host: "Host", status: "Status" } as const;
// Response-code classes: colour, name and the filter a click applies. Rows from before codes were recorded show as "unknown".
const CLASSES = [["s2", "2xx OK", "#2e9d5b", "2xx"], ["s3", "3xx redirect", "#3b82c4", "3xx"], ["s4", "4xx client error", "#e0a21b", "4xx"], ["s5", "5xx server error", "#d64545", "5xx"]] as const;
const UNKNOWN = "#9aa0a6";
const codeColor = (n: number) => (n >= 500 ? CLASSES[3][2] : n >= 400 ? CLASSES[2][2] : n >= 300 ? CLASSES[1][2] : n >= 200 ? CLASSES[0][2] : UNKNOWN);
const TOPS: [keyof Data["top"], string, keyof typeof FILTER_KEYS | "q"][] = [["path", "Top pages", "path"], ["user", "Top users", "user"], ["ip", "Top IPs", "ip"], ["method", "Methods", "method"], ["host", "Hosts", "host"], ["status", "Status codes", "status"], ["ua", "Top user agents", "q"], ["referer", "Top referrers", "q"]];

// Every request the site served (except static assets): who, what, and all headers. Click anything in the insights to filter by it.
export default function HttpLog() {
  const [d, setD] = useState<Data | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [q, setQ] = useState(""), [range, setRange] = useState(2), [win, setWin] = useState<[number, number] | null>(null), [f, setF] = useState<Partial<Record<keyof typeof FILTER_KEYS, string>>>({}), [offset, setOffset] = useState(0), [open, setOpen] = useState<string>(""), [full, setFull] = useState<any>(null);
  const [applied, setApplied] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setErr("");
    const [a, b] = win ?? [Date.now() - RANGES[range][1], 0];
    const p = new URLSearchParams({ from: new Date(a).toISOString(), unit: unitFor((b || Date.now()) - a), offset: String(offset) });
    if (b) p.set("to", new Date(b).toISOString());
    if (applied) p.set("q", applied);
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    const r = await fetch("/api/webmaster/httplog?" + p, { cache: "no-store" });
    setBusy(false);
    r.ok ? setD(await r.json()) : setErr(await r.text());
  }, [applied, range, win, f, offset]);
  useEffect(() => { load(); }, [load]);
  const pick = (k: keyof typeof FILTER_KEYS | "q", v: string | null) => { if (!v) return; setOffset(0); if (k === "q") { setQ(v); setApplied(v); } else setF((x) => ({ ...x, [k]: v })); };
  const show = async (r: Row) => { if (open === r.id) return setOpen(""); setOpen(r.id); setFull(null); const x = await fetch(`/api/webmaster/httplog?id=${r.id}&at=${encodeURIComponent(r.at)}`); setFull(x.ok ? await x.json() : { error: "Row not found (it may have been trimmed)." }); };
  const span = win ? win[1] - win[0] : RANGES[range][1], unit = unitFor(span), spanSec = span / 1000;
  const max = Math.max(1, ...(d?.buckets.map((b) => b.n) ?? []));
  const peak = d?.buckets.reduce((m, b) => (b.n > m.n ? b : m), { t: "", n: 0 });
  const pages = d ? Math.max(1, Math.ceil(d.total / PAGE)) : 1, page = Math.floor(offset / PAGE) + 1;
  // Rates are over the whole window (quiet moments count), so they are true averages.
  const bad = d ? d.buckets.reduce((a, b) => a + b.s4 + b.s5, 0) : 0, srv = d ? d.buckets.reduce((a, b) => a + b.s5, 0) : 0;
  const cards: [string, string][] = d ? [["Requests", d.total.toLocaleString()], ["Per minute", fmt((d.total / spanSec) * 60)], ["Per hour", fmt((d.total / spanSec) * 3600)], [`Peak per ${unit}`, peak?.n ? peak.n.toLocaleString() : "0"], ["Errors (4xx/5xx)", `${bad.toLocaleString()}${d.total ? ` (${fmt((bad / d.total) * 100)}%)` : ""}`], ["Server errors (5xx)", srv.toLocaleString()], ["Unique IPs", d.uniq.ips.toLocaleString()], ["Signed-in users", d.uniq.users.toLocaleString()]] : [];
  const active = Object.entries(f).filter(([, v]) => v) as [keyof typeof FILTER_KEYS, string][];
  return (
    <>
      <h1>HTTP log</h1>
      <p className="sub">Every page and API request except static files: method, URL, response code, parameters, remote IP, user agent, and the signed-in user (site account or Google admin). Headers are not stored, and token-like parameters are saved as [redacted]. About the newest 10 million requests are kept; older days are dropped automatically.</p>
      <form className="bar" onSubmit={(e) => { e.preventDefault(); setOffset(0); setApplied(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search anything: URL, params, IP, user, user agent…" aria-label="Search" style={{ minWidth: 300, flex: 1 }} />
        <select value={range} onChange={(e) => { setRange(Number(e.target.value)); setWin(null); setOffset(0); }} aria-label="Time range">{RANGES.map((r, i) => <option key={r[0]} value={i}>{r[0]}</option>)}</select>
        <button className="pri">Search</button>
        {busy && <span className="sub" style={{ margin: 0 }}>Loading…</span>}
      </form>
      {(active.length > 0 || applied) && <div className="bar">
        {active.map(([k, v]) => <button key={k} type="button" onClick={() => { setOffset(0); setF((x) => ({ ...x, [k]: "" })); }}>{FILTER_KEYS[k]}: {v} ✕</button>)}
        {applied && <button type="button" onClick={() => { setQ(""); setApplied(""); setOffset(0); }}>Search: {applied} ✕</button>}
      </div>}
      {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}
      {d && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
          {cards.map(([l, v]) => <div className="card" key={l} style={{ padding: "10px 16px" }}><div className="sub" style={{ margin: 0 }}>{l}</div><strong style={{ fontSize: 22 }}>{v}</strong></div>)}
        </div>
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div className="bar" style={{ marginBottom: 8 }}>
            <strong>Requests per {unit}, by response code</strong>
            <span className="sub" style={{ margin: 0 }}>{win ? `${new Date(win[0]).toLocaleString()} – ${new Date(win[1]).toLocaleString()}` : "Click a bar to zoom into it."}</span>
            {win && <button type="button" onClick={() => { setWin(null); setOffset(0); }}>Reset zoom</button>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="sub" style={{ margin: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 11, textAlign: "right", minWidth: 36 }}><span>{max.toLocaleString()}</span><span>0</span></div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1, height: 140, borderLeft: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} aria-label="Requests over time">
              {d.buckets.map((b) => {
                const unk = Math.max(0, b.n - b.s2 - b.s3 - b.s4 - b.s5);
                return (
                  <div key={b.t} title={`${new Date(b.t).toLocaleString()}: ${b.n.toLocaleString()} (2xx ${b.s2}, 3xx ${b.s3}, 4xx ${b.s4}, 5xx ${b.s5}${unk ? `, unknown ${unk}` : ""})`} onClick={() => { const t = +new Date(b.t); if (unit !== "second") { setWin([t, t + SEC[unit] * 1000]); setOffset(0); } }}
                    style={{ flex: 1, minWidth: 1, height: `${Math.max(1.5, (b.n / max) * 100)}%`, display: "flex", flexDirection: "column-reverse", cursor: unit === "second" ? "default" : "pointer" }}>
                    {([[b.s2, CLASSES[0][2]], [b.s3, CLASSES[1][2]], [b.s4, CLASSES[2][2]], [b.s5, CLASSES[3][2]], [unk, UNKNOWN]] as const).map(([n, c], i) => n > 0 && <div key={i} style={{ flex: n, background: c }} />)}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bar" style={{ marginTop: 8, fontSize: 12 }}>
            {CLASSES.map(([, name, c, flt]) => <button key={flt} type="button" onClick={() => { setOffset(0); setF((x) => ({ ...x, status: flt })); }} title={`Show only ${flt}`}><span aria-hidden style={{ display: "inline-block", width: 10, height: 10, background: c, marginRight: 6 }} />{name}</button>)}
            <span className="sub" style={{ margin: 0 }}><span aria-hidden style={{ display: "inline-block", width: 10, height: 10, background: UNKNOWN, marginRight: 6 }} />unknown (before codes were recorded)</span>
          </div>
          {d.buckets.length > 0 && <div className="sub" style={{ margin: "4px 0 0 42px", display: "flex", justifyContent: "space-between", fontSize: 11 }}><span>{new Date(d.buckets[0].t).toLocaleString()}</span><span>{new Date(d.buckets[d.buckets.length - 1].t).toLocaleString()}</span></div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
          {TOPS.map(([k, label, target]) => d.top[k].length > 0 && (
            <div className="card" key={k}><strong>{label}</strong>
              {d.top[k].map((t) => (
                <button key={String(t.v)} type="button" onClick={() => pick(target, t.v)} title={t.v ?? ""} style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 8, border: 0, background: "none", padding: "3px 0", textAlign: "left", cursor: "pointer", color: "inherit" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.v ?? "(none)"}</span><span className="sub" style={{ margin: 0 }}>{t.n.toLocaleString()}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="card" style={{ fontSize: 13 }}>
          {d.rows.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}>
              <div onClick={() => show(r)} style={{ cursor: "pointer", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span className="sub" style={{ margin: 0 }}>{new Date(r.at).toLocaleString()}</span>
                <span className="tag" style={{ fontWeight: 700 }}>{r.method}</span>
                <span className="tag" style={{ fontWeight: 700, color: codeColor(r.status) }} title="Response code">{r.status || "—"}</span>
                <span style={{ wordBreak: "break-all" }}>{r.path}{r.query && "?" + r.query}</span>
                <span className="sub" style={{ margin: 0 }}>{r.ip}{r.user && " · " + r.user}</span>
              </div>
              {open === r.id && <div style={{ margin: "8px 0 4px", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                {!full ? "Loading…" : full.error ? full.error : <>
                  <div>Status: {full.status || "unknown"} · Host: {full.host} · User agent: {full.ua || "(none)"} · Referrer: {full.referer || "(none)"}</div>
                  <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{"Params " + JSON.stringify(full.params, null, 2)}</pre>
                </>}
              </div>}
            </div>
          ))}
          {!d.rows.length && <p className="sub">No requests match.</p>}
        </div>
        <div className="bar" style={{ marginTop: 12 }}>
          <button disabled={page <= 1} onClick={() => setOffset(0)}>« First</button>
          <button disabled={page <= 1} onClick={() => setOffset((page - 2) * PAGE)}>← Newer</button>
          <span className="sub" style={{ margin: 0 }}>Page <input type="number" min={1} max={pages} defaultValue={page} key={page} onKeyDown={(e) => { if (e.key === "Enter") setOffset((Math.min(pages, Math.max(1, Number((e.target as HTMLInputElement).value) || 1)) - 1) * PAGE); }} style={{ width: 80 }} aria-label="Page number" /> of {pages.toLocaleString()} · {d.total ? `${offset + 1}–${Math.min(d.total, offset + PAGE)} of ${d.total.toLocaleString()}` : "0"}</span>
          <button disabled={page >= pages} onClick={() => setOffset(page * PAGE)}>Older →</button>
          <button disabled={page >= pages} onClick={() => setOffset((pages - 1) * PAGE)}>Oldest »</button>
        </div>
      </>}
    </>
  );
}
