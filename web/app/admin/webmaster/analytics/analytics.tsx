"use client";
import Link from "next/link";
import Notice from "@/components/notice";
import { useEffect, useState } from "react";
import type { Report } from "@/lib/ga";

type Data = { report: Report; at: number; stale: boolean; error?: string };
const RANGES: [string, number][] = [["7 days", 7], ["30 days", 30], ["90 days", 90]];
const KINDS: [string, string, string][] = [["ai", "AI assistants", "#8b5cc6"], ["search", "Search engines", "#2f6fdb"], ["social", "Social", "#d64580"], ["other", "Other sites", "#2e9d5b"], ["direct", "Direct", "#9aa0a6"]];
const n = (x: number) => Math.round(x).toLocaleString();
const mins = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
const change = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs. the period before` : "");

// Replaces the old "HTTP referrers" page: the same question (which AI assistants, search engines and sites send visitors?) answered from Google Analytics.
export default function Analytics({ ready }: { ready: boolean }) {
  const [days, setDays] = useState(30), [d, setD] = useState<Data | null>(null), [err, setErr] = useState("");
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setErr(""); setD(null);
    fetch(`/api/webmaster/analytics?days=${days}`, { cache: "no-store" })
      .then(async (r) => { if (!live) return; if (r.ok) setD(await r.json()); else setErr(await r.text()); })
      .catch(() => live && setErr("Could not reach the server. Try again."));
    return () => { live = false; };
  }, [days, ready]);

  if (!ready) return <><h1>Analytics</h1><div className="card"><p className="sub">Google Analytics is not set up. An admin can turn it on in <Link href="/admin/services/google-analytics">Setup &gt; Google Analytics</Link>.</p></div></>;
  const r = d?.report, max = Math.max(1, ...(r?.daily.map((x) => x.users) ?? []));
  const kindTotal = r ? Object.values(r.kinds).reduce((a, b) => a + b, 0) || 1 : 1;
  const topMax = Math.max(1, ...(r?.pages.map((p) => p.views) ?? []));
  return (
    <>
      <h1>Analytics</h1>
      <p className="sub">From Google Analytics, refreshed at most once an hour. Covers the last full days up to yesterday. Google may hold back small counts and takes a day to finish processing.</p>
      <div className="bar" role="group" aria-label="Time range">
        {RANGES.map(([l, v]) => <button key={v} aria-pressed={days === v} className={days === v ? "pri" : undefined} onClick={() => setDays(v)}>{l}</button>)}
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {!r && !err && <p className="sub">Loading…</p>}
      {d && r && <>
        {d.stale && <Notice kind="info">These numbers are the copy from {new Date(d.at).toLocaleString()} because the refresh failed: {d.error || "Google could not be reached"}</Notice>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
          {([["Visitors", n(r.users), change(r.users, r.prev.users)], ["Page views", n(r.views), change(r.views, r.prev.views)], ["Engagement rate", `${(r.engagement * 100).toFixed(1)}%`, ""], ["Avg. session", mins(r.duration), ""]] as const).map(([l, v, c]) => <div className="card" key={l} style={{ padding: "10px 16px" }}><div className="sub" style={{ margin: 0 }}>{l}</div><strong style={{ fontSize: 22 }}>{v}</strong><div className="sub" style={{ margin: 0, fontSize: 12 }}>{c}</div></div>)}
        </div>
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <strong>Visitors per day</strong>
          <div role="img" aria-label="Visitors per day" style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 140, marginTop: 8, borderBottom: "1px solid var(--line)" }}>
            {r.daily.map((x) => <div key={x.d} title={`${x.d}: ${n(x.users)} visitors, ${n(x.views)} page views`} style={{ flex: 1, minWidth: 1, height: `${(x.users / max) * 100}%`, background: "#2f6fdb" }} />)}
          </div>
          <div className="sub" style={{ margin: "4px 0 0", display: "flex", justifyContent: "space-between", fontSize: 11 }}><span>{r.daily[0]?.d}</span><span>peak {n(max)}</span><span>{r.daily.at(-1)?.d}</span></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
          <div className="card"><strong>Where visits come from</strong>
            {KINDS.filter(([k]) => r.kinds[k]).map(([k, l, c]) => <div key={k} style={{ margin: "8px 0" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{l}</span><span className="sub" style={{ margin: 0 }}>{n(r.kinds[k])} · {Math.round((r.kinds[k] / kindTotal) * 100)}%</span></div><div style={{ height: 8, background: "var(--line)", borderRadius: 4 }}><div style={{ width: `${(r.kinds[k] / kindTotal) * 100}%`, height: 8, background: c, borderRadius: 4 }} /></div></div>)}
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>Sessions by source. Google's AI answers arrive as Google, so they can't be told apart.</p>
          </div>
          <div className="card"><strong>Top sources</strong>
            {r.sources.slice(0, 10).map((s) => <div key={s.source} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.source} <span className="tag">{KINDS.find((k) => k[0] === s.kind)?.[1] ?? s.kind}</span></span><span className="sub" style={{ margin: 0 }}>{n(s.sessions)}</span></div>)}
          </div>
          <div className="card"><strong>Most viewed pages</strong>
            {r.pages.map((p) => <div key={p.page} style={{ padding: "3px 0" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span title={p.page} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.page}</span><span className="sub" style={{ margin: 0 }}>{n(p.views)}</span></div><div style={{ height: 4, width: `${(p.views / topMax) * 100}%`, background: "#2f6fdb", borderRadius: 2 }} /></div>)}
          </div>
          <div className="card"><strong>Countries</strong>
            {r.countries.map((c) => <div key={c.country} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" }}><span>{c.country}</span><span className="sub" style={{ margin: 0 }}>{n(c.users)}</span></div>)}
          </div>
        </div>
        <p className="sub">Updated {new Date(d.at).toLocaleString()}.</p>
      </>}
    </>
  );
}
