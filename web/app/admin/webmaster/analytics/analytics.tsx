"use client";
import Link from "next/link";
import Notice from "@/components/notice";
import { Fragment, useEffect, useState } from "react";
import type { Report } from "@/lib/ga";

type Data = { report: Report; at: number; stale: boolean; error?: string };
const RANGES: [string, number][] = [["7 days", 7], ["30 days", 30], ["90 days", 90]];
const KINDS: [string, string, string][] = [["ai", "AI assistants", "#8b5cc6"], ["search", "Search engines", "#2f6fdb"], ["social", "Social", "#d64580"], ["other", "Other sites", "#2e9d5b"], ["direct", "Direct", "#9aa0a6"]];
const LABEL = { users: "Visitors", sessions: "Sessions", views: "Page views" };
const n = (x: number) => Math.round(x).toLocaleString();
const mins = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
const change = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs. the period before` : "");
const pct = (a: number, total: number) => `${Math.round((a / (total || 1)) * 100)}%`;
const csv = (r: Report) => [["section", "name", "value"], ...([["pages", r.pages.map((x) => [x.page, x.views])], ["landing pages", r.landing.map((x) => [x.page, x.n])], ["sources", r.sources.map((x) => [x.source, x.sessions])], ["channels", r.channels.map((x) => [x.name, x.n])], ["countries", r.countries.map((x) => [x.country, x.users])], ["cities", r.cities.map((x) => [x.name, x.n])], ["devices", r.devices.map((x) => [x.name, x.n])], ["browsers", r.browsers.map((x) => [x.name, x.n])], ["operating systems", r.systems.map((x) => [x.name, x.n])], ["events", r.events.map((x) => [x.name, x.n])], ["daily visitors", r.daily.map((x) => [x.d, x.users])], ["daily sessions", r.daily.map((x) => [x.d, x.sessions])], ["daily page views", r.daily.map((x) => [x.d, x.views])]] as [string, (string | number)[][]][]).flatMap(([sec, l]) => l.map(([a, b]) => [sec, a, b]))].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(",")).join("\n"); // leading =+-@ is neutralised so a page path can't run as a spreadsheet formula

/** A ranked list with a share bar. */
function Top({ title, rows, note }: { title: string; rows: { label: string; n: number; tag?: string }[]; note?: string }) {
  const max = Math.max(1, ...rows.map((x) => x.n)), total = rows.reduce((a, x) => a + x.n, 0);
  return (
    <div className="card"><strong>{title}</strong>
      {!rows.length && <p className="sub">No data.</p>}
      {rows.map((x) => <div key={x.label} style={{ padding: "3px 0" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span title={x.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}{x.tag && <> <span className="tag">{x.tag}</span></>}</span><span className="sub" style={{ margin: 0, whiteSpace: "nowrap" }}>{n(x.n)} · {pct(x.n, total)}</span></div><div style={{ height: 4, width: `${(x.n / max) * 100}%`, background: "#2f6fdb", borderRadius: 2 }} /></div>)}
      {note && <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>{note}</p>}
    </div>
  );
}

const LINES = ["#2f6fdb", "#d64580", "#2e9d5b", "#8b5cc6", "#e08a1e"];
/** The five biggest sources as lines, one point per day (sessions). */
function Trend({ trend, dates }: { trend: Report["trend"]; dates: string[] }) {
  const max = Math.max(1, ...trend.flatMap((t) => t.vals)), W = 600, H = 120, x = (i: number) => (dates.length > 1 ? (i / (dates.length - 1)) * W : W / 2);
  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}><strong>Top sources over time</strong>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sessions per day for the top sources" preserveAspectRatio="none" style={{ width: "100%", height: 140, marginTop: 8, borderBottom: "1px solid var(--line)" }}>
        {trend.map((t, k) => <polyline key={t.source} fill="none" stroke={LINES[k]} strokeWidth="2" vectorEffect="non-scaling-stroke" points={t.vals.map((v, i) => `${x(i)},${H - (v / max) * (H - 4) - 2}`).join(" ")}><title>{t.source}</title></polyline>)}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 6, fontSize: 12 }}>{trend.map((t, k) => <span key={t.source}><span style={{ color: LINES[k] }}>●</span> {t.source} · {n(t.vals.reduce((a, b) => a + b, 0))}</span>)}</div>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday x hour grid: darker = more sessions. */
function Heatmap({ heat }: { heat: number[][] }) {
  const max = Math.max(1, ...heat.flat());
  return (
    <div className="card" style={{ marginBottom: 16, padding: 16, overflowX: "auto" }}><strong>Busiest times (sessions, Eastern time)</strong>
      <div role="img" aria-label="Sessions by weekday and hour" style={{ display: "grid", gridTemplateColumns: "34px repeat(24, minmax(14px, 1fr))", gap: 2, marginTop: 8, minWidth: 460 }}>
        {heat.map((row, d) => <Fragment key={d}><span className="sub" style={{ margin: 0, fontSize: 11 }}>{DAYS[d]}</span>{row.map((v, h) => <div key={h} title={`${DAYS[d]} ${h}:00 — ${n(v)} sessions`} style={{ height: 16, borderRadius: 2, background: v ? `rgba(47,111,219,${0.12 + 0.88 * (v / max)})` : "var(--line)" }} />)}</Fragment>)}
        <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="sub" style={{ margin: 0, fontSize: 10, textAlign: "center" }}>{h % 6 === 0 ? h : ""}</span>)}
      </div>
    </div>
  );
}

type Extra = { bots: { bot: string; kind: string; n: number }[]; conversions: { kind: string; label: string; total: number; unknown: number; sources: { source: string; type: string; n: number }[] }[]; search: { ok: true; from: string; to: string; queries: SRow[]; pages: SRow[] } | { ok: false; reason: string; hide: boolean } };
type SRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
const BOT_KIND: Record<string, string> = { training: "AI training / indexing", assistant: "AI assistant for a person", search: "Search engine" };

function SearchTable({ title, rows }: { title: string; rows: SRow[] }) {
  return (
    <div className="card" style={{ overflowX: "auto" }}><strong>{title}</strong>
      <table style={{ width: "100%", fontSize: 13, marginTop: 6 }}><thead><tr style={{ textAlign: "left" }}><th>{/pages/i.test(title) ? "Page" : "Search"}</th><th>Clicks</th><th>Shown</th><th>Position</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.key}><td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.key}>{x.key.replace(/^https?:\/\/[^/]+/, "") || "/"}</td><td>{n(x.clicks)}</td><td>{n(x.impressions)}</td><td>{x.position.toFixed(1)}</td></tr>)}</tbody></table>
    </div>
  );
}

// Replaces the old "HTTP referrers" page: the same question (which AI assistants, search engines and sites send visitors?) answered from Google Analytics.
export default function Analytics({ ready }: { ready: boolean }) {
  const [days, setDays] = useState(30), [metric, setMetric] = useState<"users" | "sessions" | "views">("users"), [custom, setCustom] = useState<{ from: string; to: string } | null>(null), [pick, setPick] = useState({ from: "", to: "" }), [x, setX] = useState<Extra | null>(null), [live, setLive] = useState<{ now: number; pages: { page: string; n: number }[] } | null>(null), [d, setD] = useState<Data | null>(null), [err, setErr] = useState("");
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setErr(""); setD(null); setX(null);
    const range = custom ? `from=${custom.from}&to=${custom.to}` : `days=${days}`;
    fetch(`/api/webmaster/analytics?${range}&extra=1`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => live && j && setX(j)).catch(() => {}); // crawlers, conversions, Search Console: nice to have, never blocks the report
    fetch(`/api/webmaster/analytics?${range}`, { cache: "no-store" })
      .then(async (r) => { if (!live) return; if (r.ok) setD(await r.json()); else setErr(await r.text()); })
      .catch(() => live && setErr("Could not reach the server. Try again."));
    return () => { live = false; };
  }, [days, custom, ready]);
  useEffect(() => { // who is on the site right now; refreshed every minute while this page is open
    if (!ready) return;
    let live = true;
    const go = () => fetch("/api/webmaster/analytics?live=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => live && j && setLive(j)).catch(() => {});
    go(); const t = setInterval(go, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [ready]);

  if (!ready) return <><h1>Analytics</h1><div className="card"><p className="sub">Google Analytics is not set up. An admin can turn it on in <Link href="/admin/services/google-analytics">Setup &gt; Google Analytics</Link>.</p></div></>;
  const r = d?.report, max = Math.max(1, ...(r?.daily.map((x) => x[metric]) ?? []));
  const avg = r?.daily.length ? r.daily.reduce((a, x) => a + x[metric], 0) / r.daily.length : 0, best = r?.daily.find((x) => x[metric] === max);
  const peakHour = r ? r.hourly.indexOf(Math.max(...r.hourly)) : 0;
  const kindTotal = r ? Object.values(r.kinds).reduce((a, b) => a + b, 0) || 1 : 1;
    return (
    <>
      <h1>Analytics</h1>
      <p className="sub">From Google Analytics, refreshed at most once an hour. Covers the last full days up to yesterday. Google may hold back small counts and takes a day to finish processing.</p>
      <div className="bar" role="group" aria-label="Time range">
        {RANGES.map(([l, v]) => <button key={v} aria-pressed={!custom && days === v} className={!custom && days === v ? "pri" : undefined} onClick={() => { setCustom(null); setDays(v); }}>{l}</button>)}
      </div>
      <form className="bar" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (pick.from && pick.to) setCustom(pick); }}>
        <label>From <input type="date" required max={pick.to || undefined} value={pick.from} onChange={(e) => setPick({ ...pick, from: e.target.value })} /></label>
        <label>To <input type="date" required min={pick.from || undefined} max={new Date().toISOString().slice(0, 10)} value={pick.to} onChange={(e) => setPick({ ...pick, to: e.target.value })} /></label>
        <button className={custom ? "pri" : undefined}>Custom range</button>
      </form>
      {live && <div className="card" style={{ margin: "12px 0", padding: "10px 16px" }}><strong style={{ color: "#2e9d5b" }}>● {n(live.now)}</strong> active in the last 30 minutes{live.pages.length > 0 && <span className="sub" style={{ margin: 0 }}> — {live.pages.map((p) => `${p.page} (${p.n})`).join(", ")}</span>}</div>}
      {err && <Notice kind="error">{err}</Notice>}
      {!r && !err && <p className="sub">Loading…</p>}
      {d && r && <>
        {d.stale && <Notice kind="info">These numbers are the copy from {new Date(d.at).toLocaleString()} because the refresh failed: {d.error || "Google could not be reached"}</Notice>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
          {([["Visitors", n(r.users), change(r.users, r.prev.users)], ["Sessions", n(r.sessions), change(r.sessions, r.prev.sessions)], ["Page views", n(r.views), change(r.views, r.prev.views)], ["Views per session", r.sessions ? (r.views / r.sessions).toFixed(1) : "0", ""], ["New visitors", `${n(r.newUsers)} · ${pct(r.newUsers, r.users)}`, ""], ["Engagement rate", `${(r.engagement * 100).toFixed(1)}%`, r.prev.engagement ? `${r.engagement >= r.prev.engagement ? "+" : ""}${((r.engagement - r.prev.engagement) * 100).toFixed(1)} pts vs. the period before` : ""], ["Avg. session", mins(r.duration), change(r.duration, r.prev.duration)]] as const).map(([l, v, c]) => <div className="card" key={l} style={{ padding: "10px 16px" }}><div className="sub" style={{ margin: 0 }}>{l}</div><strong style={{ fontSize: 22 }}>{v}</strong><div className="sub" style={{ margin: 0, fontSize: 12 }}>{c}</div></div>)}
        </div>
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>{LABEL[metric]} per day</strong>
            <span className="bar" role="group" aria-label="Chart metric">{(["users", "sessions", "views"] as const).map((m) => <button key={m} aria-pressed={metric === m} className={metric === m ? "pri" : undefined} onClick={() => setMetric(m)}>{LABEL[m]}</button>)}</span></div>
          <div role="img" aria-label="Per day" style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 140, marginTop: 8, borderBottom: "1px solid var(--line)" }}>
            {r.daily.map((x) => <div key={x.d} title={`${x.d}: ${n(x.users)} visitors, ${n(x.sessions)} sessions, ${n(x.views)} page views`} style={{ flex: 1, minWidth: 1, height: `${(x[metric] / max) * 100}%`, background: "#2f6fdb" }} />)}
          </div>
          <div className="sub" style={{ margin: "4px 0 0", display: "flex", justifyContent: "space-between", fontSize: 11 }}><span>{r.daily[0]?.d}</span><span>avg {n(avg)} · best {best?.d} ({n(max)})</span><span>{r.daily.at(-1)?.d}</span></div>
        </div>
        <Heatmap heat={r.heat} />
        {r.trend.length > 0 && <Trend trend={r.trend} dates={r.daily.map((x) => x.d)} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
          <div className="card"><strong>Where visits come from</strong>
            {KINDS.filter(([k]) => r.kinds[k]).map(([k, l, c]) => <div key={k} style={{ margin: "8px 0" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{l}</span><span className="sub" style={{ margin: 0 }}>{n(r.kinds[k])} · {Math.round((r.kinds[k] / kindTotal) * 100)}%</span></div><div style={{ height: 8, background: "var(--line)", borderRadius: 4 }}><div style={{ width: `${(r.kinds[k] / kindTotal) * 100}%`, height: 8, background: c, borderRadius: 4 }} /></div></div>)}
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>Sessions by source. Google's AI answers arrive as Google, so they can't be told apart.</p>
          </div>
          <div className="card"><strong>Top sources</strong>
            {r.sources.slice(0, 10).map((s) => <div key={s.source} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.source} <span className="tag">{KINDS.find((k) => k[0] === s.kind)?.[1] ?? s.kind}</span></span><span className="sub" style={{ margin: 0 }}>{n(s.sessions)}</span></div>)}
          </div>
          <Top title="Most viewed pages" rows={r.pages.map((p) => ({ label: p.page, n: p.views }))} />
          <Top title="Landing pages" rows={r.landing.map((p) => ({ label: p.page, n: p.n }))} note="Where visits start (sessions)." />
          <Top title="Channels" rows={r.channels.map((x) => ({ label: x.name, n: x.n }))} note="Sessions by Google's channel grouping." />
          <Top title="New vs. returning" rows={r.visitorType.map((x) => ({ label: x.name, n: x.n }))} note="Visitors." />
          <Top title="Countries" rows={r.countries.map((c) => ({ label: c.country, n: c.users }))} />
          <Top title="Cities" rows={r.cities.map((x) => ({ label: x.name, n: x.n }))} />
          <Top title="Devices" rows={r.devices.map((x) => ({ label: x.name, n: x.n }))} />
          <Top title="Browsers" rows={r.browsers.map((x) => ({ label: x.name, n: x.n }))} />
          <Top title="Operating systems" rows={r.systems.map((x) => ({ label: x.name, n: x.n }))} />
          <Top title="Events" rows={r.events.map((x) => ({ label: x.name, n: x.n }))} note="Everything GA records: page_view, scroll, click and so on." />
        </div>
        {x && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
          <div className="card"><strong>What visitors do, by where they came from</strong>
            {x.conversions.map((c) => <div key={c.kind} style={{ margin: "8px 0" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{c.label}</span><span className="sub" style={{ margin: 0 }}>{n(c.total)}</span></div>
              {c.sources.map((s) => <div key={s.source} className="sub" style={{ margin: 0, fontSize: 12, paddingLeft: 12 }}>{s.source} <span className="tag">{KINDS.find((k) => k[0] === s.type)?.[1] ?? s.type}</span> · {n(s.n)}</div>)}
              {c.unknown > 0 && <div className="sub" style={{ margin: 0, fontSize: 12, paddingLeft: 12 }}>not known (no cookies accepted) · {n(c.unknown)}</div>}</div>)}
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>Counted when someone books a tour, writes to us or signs up. The source is where they first arrived from, kept in a 90-day cookie.</p>
          </div>
          <div className="card"><strong>Crawlers vs. people</strong>
            <p className="sub" style={{ margin: "6px 0" }}>People from AI assistants (Google Analytics): <strong>{n(r.kinds.ai ?? 0)}</strong> visits.</p>
            {!x.bots.length && <p className="sub">No crawler requests found in the HTTP log.</p>}
            {x.bots.map((b) => <div key={b.bot} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" }}><span>{b.bot} <span className="tag">{BOT_KIND[b.kind] ?? b.kind}</span></span><span className="sub" style={{ margin: 0 }}>{n(b.n)}</span></div>)}
            <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Requests counted from the server's HTTP log by each bot's own name. Bots don't show up in Google Analytics. A bot can use a false name.</p>
          </div>
          {x.search.ok && <><SearchTable title="Search terms that found us" rows={x.search.queries} /><SearchTable title="Pages found in search" rows={x.search.pages} /></>}
          {!x.search.ok && !x.search.hide && <div className="card"><strong>Search terms</strong><p className="sub">Search Console is not available: {x.search.reason}</p></div>}
        </div>}
        {x?.search.ok && <p className="sub" style={{ marginTop: -8 }}>Search Console data: {x.search.from} to {x.search.to} (it runs about 2 days behind).</p>}
        <p className="sub">Busiest hour: {r.hourly.some(Boolean) ? `${peakHour}:00–${peakHour + 1}:00` : "none yet"}. Updated {new Date(d.at).toLocaleString()}. Hours and weekdays are in Eastern time. <button onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv(r)], { type: "text/csv" })); a.download = custom ? `analytics-${custom.from}-to-${custom.to}.csv` : `analytics-${days}-days.csv`; a.click(); URL.revokeObjectURL(a.href); }}>Download CSV</button></p>
      </>}
    </>
  );
}
