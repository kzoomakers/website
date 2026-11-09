"use client";
import Notice from "@/components/notice";
import { useEffect, useState } from "react";

type Kind = "ai" | "search" | "social" | "other";
type N = { v: string | null; n: number };
type Data = { days: number; total: number; prev: number; daily: { d: string; source: string; n: number }[]; sources: N[]; landing: N[]; hosts: N[]; via: N[] };
const TABS: [Kind, string, string][] = [["ai", "AI stats", "Visitors sent by AI assistants such as ChatGPT, Perplexity, Claude and Gemini."], ["search", "Search engines", "Visitors who clicked a normal search result. Google's AI answers also arrive as Google, so they can't be told apart here."], ["social", "Social", "Visitors from Facebook, Instagram, X, LinkedIn, Reddit, YouTube and other social sites."], ["other", "Other sites", "Visitors from any other website that links to us, plus anything tagged with an unfamiliar utm_source."]];
const RANGES: [string, number][] = [["7 days", 7], ["30 days", 30], ["90 days", 90], ["6 months", 182], ["1 year", 365]];
const COLORS = ["#2f6fdb", "#e0792b", "#2e9d5b", "#8b5cc6", "#d64580", "#16a3b8", "#b8a21b", "#c2453f"];
const GREY = "#9aa0a6";
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY = 864e5;

export default function Referrers() {
  const [kind, setKind] = useState<Kind>("ai"), [days, setDays] = useState(30), [custom, setCustom] = useState<[string, string] | null>(null), [d, setD] = useState<Data | null>(null), [err, setErr] = useState("");
  const [from, to] = custom ?? [day(Date.now() - (days - 1) * DAY), day(Date.now())];
  useEffect(() => {
    let live = true;
    setErr(""); setD(null);
    fetch(`/api/webmaster/referrers?kind=${kind}&from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => { if (!live) return; if (r.ok) setD(await r.json()); else setErr(await r.text()); })
      .catch(() => live && setErr("Could not reach the server. Try again."));
    return () => { live = false; };
  }, [kind, from, to]);

  // Biggest sources get a colour each; the rest share grey so the chart stays readable.
  const names = d?.sources.map((s) => s.v ?? "") ?? [], shown = names.slice(0, COLORS.length);
  const colorOf = (s: string) => { const i = shown.indexOf(s); return i < 0 ? GREY : COLORS[i]; };
  const series = d ? Array.from({ length: d.days }, (_, i) => day(Date.parse(from) + i * DAY)) : [];
  const perDay = new Map<string, Map<string, number>>();
  for (const r of d?.daily ?? []) { const k = shown.includes(r.source) ? r.source : "Everything else"; const m = perDay.get(r.d.slice(0, 10)) ?? new Map(); m.set(k, (m.get(k) ?? 0) + r.n); perDay.set(r.d.slice(0, 10), m); }
  const totals = series.map((s) => [...(perDay.get(s)?.values() ?? [])].reduce((a, b) => a + b, 0)), max = Math.max(1, ...totals);
  const legend = [...shown, ...(names.length > shown.length ? ["Everything else"] : [])];
  const pct = d && d.prev ? Math.round(((d.total - d.prev) / d.prev) * 100) : null;
  const peak = d ? series[totals.indexOf(Math.max(...totals))] : "";
  // Pie: conic-gradient stops from the cumulative share of each source.
  let acc = 0;
  const slices = d && d.total ? legend.map((n) => { const v = n === "Everything else" ? d.total - d.sources.slice(0, shown.length).reduce((a, s) => a + s.n, 0) : d.sources.find((s) => s.v === n)?.n ?? 0; return { n, v, c: n === "Everything else" ? GREY : colorOf(n) }; }) : [];
  const pie = slices.map((s) => { const a = (acc / d!.total) * 100; acc += s.v; return `${s.c} ${a}% ${(acc / d!.total) * 100}%`; }).join(", ");
  const blurb = TABS.find((t) => t[0] === kind)![2];

  const list = (title: string, rows: N[], fallback = "(unknown)") => rows.length > 0 && (
    <div className="card"><strong>{title}</strong>
      {rows.map((t) => (
        <div key={String(t.v)} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" }}>
          <span title={t.v ?? ""} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.v ?? fallback}</span><span className="sub" style={{ margin: 0 }}>{t.n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <h1>HTTP referrers</h1>
      <p className="sub">Where our visitors come from, counted per page view that arrives from another site (a reload counts again) (clicks around our own site, robots, the API and admin pages are left out). Daily totals are kept for one year. Days are counted in UTC.</p>
      <nav className="bar" aria-label="Referrer type">
        {TABS.map(([k, l]) => <button key={k} aria-pressed={kind === k} className={kind === k ? "pri" : undefined} onClick={() => setKind(k)}>{l}</button>)}
      </nav>
      <p className="sub">{blurb}</p>
      <div className="bar" role="group" aria-label="Time range">
        {RANGES.map(([l, n]) => <button key={n} aria-pressed={!custom && days === n} className={!custom && days === n ? "pri" : undefined} onClick={() => { setCustom(null); setDays(n); }}>{l}</button>)}
        <label>From <input type="date" value={from} max={to} onChange={(e) => e.target.value && setCustom([e.target.value, to])} /></label>
        <label>to <input type="date" value={to} min={from} max={day(Date.now())} onChange={(e) => e.target.value && setCustom([from, e.target.value])} /></label>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {!d && !err && <p className="sub">Loading…</p>}
      {d && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
          {([["Page views", d.total.toLocaleString()], ["Change vs. the period before", pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`], ["Top source", d.sources[0]?.v ?? "—"], ["Sources seen", String(d.sources.length >= 15 ? "15+" : d.sources.length)], ["Busiest day", d.total ? new Date(peak + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC" }) : "—"]] as const).map(([l, v]) => <div className="card" key={l} style={{ padding: "10px 16px" }}><div className="sub" style={{ margin: 0 }}>{l}</div><strong style={{ fontSize: 22 }}>{v}</strong></div>)}
        </div>
        {!d.total ? <div className="card"><p className="sub" style={{ margin: 0 }}>No page views recorded for this range yet. Counting started when this page was added, so earlier days stay empty.</p></div> : <>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <strong>Page views per day, by source</strong>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <div className="sub" style={{ margin: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 11, textAlign: "right", minWidth: 28 }}><span>{max.toLocaleString()}</span><span>0</span></div>
              <div role="img" aria-label="Page views per day" style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: series.length > 120 ? 0 : 1, height: 160, borderLeft: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
                {series.map((s, i) => (
                  <div key={s} title={`${s}: ${totals[i]}${[...(perDay.get(s) ?? [])].map(([k, v]) => `\n${k}: ${v}`).join("")}`} style={{ flex: 1, minWidth: 1, height: `${(totals[i] / max) * 100}%`, display: "flex", flexDirection: "column-reverse" }}>
                    {legend.map((n) => { const v = perDay.get(s)?.get(n) ?? 0; return v > 0 && <div key={n} style={{ flex: v, background: n === "Everything else" ? GREY : colorOf(n) }} />; })}
                  </div>
                ))}
              </div>
            </div>
            <div className="sub" style={{ margin: "4px 0 0 34px", display: "flex", justifyContent: "space-between", fontSize: 11 }}><span>{from}</span><span>{to}</span></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div className="card"><strong>Share of page views</strong>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <div role="img" aria-label="Pie chart of page views by source" style={{ width: 150, height: 150, borderRadius: "50%", background: `conic-gradient(${pie})`, flex: "none" }} />
                <div style={{ fontSize: 13, flex: 1, minWidth: 140 }}>
                  {slices.map((s) => <div key={s.n} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0" }}><span><span aria-hidden style={{ display: "inline-block", width: 10, height: 10, background: s.c, marginRight: 6 }} />{s.n}</span><span className="sub" style={{ margin: 0 }}>{s.v.toLocaleString()} · {Math.round((s.v / d.total) * 100)}%</span></div>)}
                </div>
              </div>
            </div>
            {list("Top sources", d.sources)}
            {list("Landing pages", d.landing)}
            {kind !== "ai" && kind !== "search" && list("Referring sites", d.hosts, "(tag only, no referrer)")}
            {list("How we know", d.via.map((x) => ({ v: x.v === "utm" ? "utm_source tag" : "Referrer header", n: x.n })))}
          </div>
        </>}
      </>}
    </>
  );
}
