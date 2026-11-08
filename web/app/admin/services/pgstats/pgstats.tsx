"use client";
import { useEffect, useRef, useState } from "react";
import type { Query } from "@/lib/pgstats";

type Stat = Record<"numbackends" | "commit" | "rollback" | "blks_read" | "blks_hit" | "returned" | "fetched" | "inserted" | "updated" | "deleted" | "deadlocks" | "temp_bytes", number>;
type Snap = { at: number; source: string; stat: Stat; conns: { state: string; n: number }[]; size: number; queries: Query[] };
const EVERY = 3000, KEEP = 60;
const n = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });
const bytes = (b: number) => (b >= 2 ** 30 ? n(b / 2 ** 30, 2) + " GB" : b >= 2 ** 20 ? n(b / 2 ** 20, 1) + " MB" : n(b / 1024) + " KB");
const ms = (v: number | null) => (v == null ? "–" : v >= 1000 ? n(v / 1000, 2) + " s" : n(v, 2) + " ms");

function Spark({ v }: { v: number[] }) {
  const max = Math.max(...v, 1e-9), pts = v.map((y, i) => `${(i / (KEEP - 1)) * 100},${28 - (y / max) * 26}`).join(" ");
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 34 }}><polyline points={pts} fill="none" stroke="#3b82c4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

// Live database counters (rates are the change since the last poll) and the slowest statements by total time.
export default function PgStats() {
  const [cur, setCur] = useState<Snap | null>(null), [err, setErr] = useState(""), [hist, setHist] = useState<Record<string, number[]>>({});
  const prev = useRef<Snap | null>(null);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/webmaster/pgstats", { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text());
        const s: Snap = await r.json();
        if (!live) return;
        const p = prev.current, dt = p ? (s.at - p.at) / 1000 : 0;
        if (p && dt > 0) {
          const rate = (k: keyof Stat) => Math.max(0, (s.stat[k] - p.stat[k]) / dt);
          const now = { tps: rate("commit") + rate("rollback"), rows: rate("returned") + rate("fetched"), writes: rate("inserted") + rate("updated") + rate("deleted"), conns: s.stat.numbackends };
          setHist((h) => Object.fromEntries(Object.entries(now).map(([k, v]) => [k, [...(h[k] ?? []), v].slice(-KEEP)])));
        }
        prev.current = s; setCur(s); setErr("");
      } catch (e) { if (live) setErr((e as Error).message); }
    };
    tick(); const t = setInterval(tick, EVERY);
    return () => { live = false; clearInterval(t); };
  }, []);

  if (!cur) return <p style={{ padding: 16 }}>{err || "Loading…"}</p>;
  const { stat: s } = cur, last = (k: string) => hist[k]?.at(-1) ?? 0;
  const hit = s.blks_hit + s.blks_read ? (100 * s.blks_hit) / (s.blks_hit + s.blks_read) : 100;
  const tiles: [string, string, string?][] = [["Transactions / s", n(last("tps"), 1), "tps"], ["Rows read / s", n(last("rows")), "rows"], ["Rows written / s", n(last("writes"), 1), "writes"], ["Connections", String(s.numbackends), "conns"],
    ["Cache hit", n(hit, 2) + " %"], ["Database size", bytes(cur.size)], ["Rollbacks", n(s.rollback)], ["Deadlocks", n(s.deadlocks)], ["Temp files", bytes(s.temp_bytes)]];
  return (
    <div style={{ padding: 16, maxWidth: 1200 }}>
      <h1>Postgres stats</h1>
      <p style={{ opacity: 0.7 }}>Updates every 3 seconds{document.hidden ? " (paused: tab hidden)" : ""}. Counters are since the last stats reset. {err && <b style={{ color: "#d64545" }}>Last refresh failed: {err}</b>}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
        {tiles.map(([label, val, k]) => (
          <div key={label} style={{ border: "1px solid #8884", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div><div style={{ fontSize: 24, fontWeight: 600 }}>{val}</div>
            {k && hist[k] && <Spark v={hist[k]} />}
          </div>))}
      </div>
      <h2 style={{ marginTop: 24 }}>Sessions</h2>
      <p>{cur.conns.map((c) => `${c.state}: ${c.n}`).join(" · ")}</p>
      <h2>Slowest statements <small style={{ fontWeight: 400, opacity: 0.7 }}>by total time · source: {cur.source}</small></h2>
      {cur.source === "none" ? <p>Neither pg_stat_monitor nor pg_stat_statements is available on this server, so only the counters above are shown.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left" }}>{["Statement", "Calls", "Total", "Mean", "Max", "Rows"].map((h) => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
            <tbody>{cur.queries.map((q) => (
              <tr key={q.id} style={{ borderTop: "1px solid #8884", verticalAlign: "top" }}>
                <td style={{ padding: 6, fontFamily: "monospace", wordBreak: "break-word" }}>{q.query}</td>
                <td style={{ padding: 6 }}>{n(q.calls)}</td><td style={{ padding: 6 }}>{ms(q.total)}</td><td style={{ padding: 6 }}>{ms(q.mean)}</td><td style={{ padding: 6 }}>{ms(q.max)}</td><td style={{ padding: 6 }}>{n(q.rows)}</td>
              </tr>))}</tbody>
          </table>
        </div>)}
    </div>
  );
}
