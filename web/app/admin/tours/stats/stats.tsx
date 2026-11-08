"use client";
import Notice from "@/components/notice";
import { useRef, useState } from "react";
import { hue } from "@/lib/tours-fmt";
import type { stats } from "@/lib/tours";
import { tours } from "../rpc";

type S = Awaited<ReturnType<typeof stats>>;
const RANGES: [number, string][] = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "1 year"], [0, "All time"]];
const LABEL: Record<string, string> = { booked: "Still booked", no_show: "No-show", signed_up: "Signed up", sign_up_later: "Will sign up later", maybe_later: "Maybe later", no_interest: "Not interested" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const dur = (d: number | null) => (d == null ? "–" : d < 1 ? `${Math.round(d * 24)} h` : `${d.toFixed(1)} d`);
const col = (k: string) => `hsl(${hue(k)} 62% 52%)`;

function Kpi({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return <div className="card" style={{ flex: "1 1 160px", margin: 0 }}><div style={{ fontSize: 22 }} aria-hidden>{icon}</div><div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{value}</div><div style={{ fontWeight: 600 }}>{label}</div>{sub && <div className="sub" style={{ margin: 0 }}>{sub}</div>}</div>;
}
/** Horizontal bars; each row is a label, a bar sized against the biggest, and the count. */
function Bars({ rows, color }: { rows: [string, number][]; color?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return <>{rows.length ? rows.map(([k, n]) => (
    <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 160px) 1fr 36px", gap: 8, alignItems: "center", margin: "6px 0" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={k}>{k}</span>
      <span style={{ background: "var(--line)", borderRadius: 6, height: 14 }}><span style={{ display: "block", height: 14, borderRadius: 6, width: `${(100 * n) / max}%`, background: color?.(k) ?? "var(--acc, #4f7cff)", transition: "width .4s" }} /></span>
      <strong style={{ textAlign: "right" }}>{n}</strong>
    </div>)) : <p className="sub">Nothing yet.</p>}</>;
}

export default function Stats({ initial }: { initial: S }) {
  const [s, setS] = useState(initial), [days, setDays] = useState(90), [err, setErr] = useState(""), latest = useRef(90);
  const pick = async (d: number) => { setDays(d); latest.current = d; try { const r = await tours<S>("stats", { days: d }); if (latest.current === d) { setS(r); setErr(""); } } catch (e: any) { if (latest.current === d) setErr(e.message); } };
  const live = s.total - s.cancelled, top = [...s.closers].filter((c) => c.won).sort((a, b) => b.won - a.won || (a.days ?? 1e9) - (b.days ?? 1e9))[0];
  const chart = s.series, maxDay = Math.max(1, ...chart.map((r) => r[1])), maxHeat = Math.max(1, ...s.heat.flat());
  const W = 700, H = 120, bw = W / Math.max(chart.length, 1);
  return (
    <>
      <h1>Stats</h1>
      <p className="sub">How tours turn into members. “Closed” means a visitor was marked <em>signed up</em>; the closer is the tour’s guide. Ranges look at when the tour was booked.</p>
      <div className="bar">
        {RANGES.map(([d, l]) => <button key={d} type="button" className={days === d ? "pri" : ""} aria-pressed={days === d} onClick={() => pick(d)}>{l}</button>)}
        {err && <Notice kind="error">{err}</Notice>}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Kpi icon="🗓️" label="Tours booked" value={live} sub={`${s.cancelled} cancelled · ${s.walkupTours} from walk-ups`} />
        <Kpi icon="🤝" label="Closed (signed up)" value={s.won} sub={`${pct(s.won, s.held)} of ${s.held} tours held`} />
        <Kpi icon="⏱️" label="Mean time to close" value={dur(s.days)} sub={s.estimated ? `booking → signed up (${s.estimated} estimated from the tour date)` : "booking → signed up"} />
        <Kpi icon="👻" label="No-show rate" value={pct(s.noShow, s.held)} sub={`${s.noShow} of ${s.held} tours held`} />
        <Kpi icon="🚶" label="Walk-up requests" value={s.requests} sub={`${s.requestsBooked} got a tour (${pct(s.requestsBooked, s.requests)})`} />
        <Kpi icon="🏆" label="Top closer" value={top?.name ?? "–"} sub={top ? `${top.won} sign-up${top.won === 1 ? "" : "s"} · ${pct(top.won, top.tours)} of tours held` : "no sign-ups yet"} />
      </div>
      <div className="card"><h2 style={{ marginTop: 0 }}>{s.weekly ? "Bookings per week" : "Bookings per day"}</h2>
        {chart.length ? <svg viewBox={`0 0 ${W} ${H + 16}`} width="100%" role="img" aria-label="Bookings over time">
          {chart.map(([d, n], i) => <rect key={d} x={i * bw + 1} width={Math.max(bw - 2, 1)} y={H - (H * n) / maxDay} height={(H * n) / maxDay} rx={2} fill="var(--acc, #4f7cff)"><title>{`${d}: ${n}`}</title></rect>)}
          <text x={0} y={H + 13} fontSize={11} fill="var(--mut)">{chart[0][0]}</text><text x={W} y={H + 13} fontSize={11} textAnchor="end" fill="var(--mut)">{chart[chart.length - 1][0]}</text>
        </svg> : <p className="sub">No bookings in this range.</p>}
      </div>
      <div className="card"><h2 style={{ marginTop: 0 }}>Closers</h2>
        {s.closers.length ? <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ textAlign: "left" }}><th>Guide</th><th>Tours held</th><th>Closed</th><th>Close rate</th><th>Mean time to close</th></tr></thead><tbody>
          {s.closers.map((c) => <tr key={c.name} style={{ borderTop: "1px solid var(--line)" }}><td><span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: col(c.name), marginRight: 6 }} />{c.name}{c === top && " 🏆"}</td><td>{c.tours}</td><td>{c.won}</td><td>{pct(c.won, c.tours)}</td><td>{dur(c.days)}</td></tr>)}
        </tbody></table> : <p className="sub">Nothing yet.</p>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <div className="card" style={{ margin: 0 }}><h2 style={{ marginTop: 0 }}>What people want to see</h2><Bars rows={s.interests as [string, number][]} /></div>
        <div className="card" style={{ margin: 0 }}><h2 style={{ marginTop: 0 }}>Where tours end up</h2><Bars rows={s.funnel.map(([k, n]) => [LABEL[k] ?? k, n])} /></div>
        <div className="card" style={{ margin: 0 }}><h2 style={{ marginTop: 0 }}>How they heard about us</h2><Bars rows={s.heard as [string, number][]} /></div>
      </div>
      <div className="card"><h2 style={{ marginTop: 0 }}>When people book</h2><p className="sub">Day and hour the booking was made (club time). Darker means busier.</p>
        <div style={{ overflowX: "auto" }}><div style={{ display: "grid", gridTemplateColumns: "40px repeat(24, minmax(16px, 1fr))", gap: 2, minWidth: 560 }}>
          {s.heat.map((row, d) => [<span key={`l${d}`} className="sub" style={{ margin: 0 }}>{DOW[d]}</span>, ...row.map((n, h) => <span key={`${d}-${h}`} title={`${DOW[d]} ${h}:00 — ${n}`} style={{ height: 18, borderRadius: 3, background: n ? `color-mix(in srgb, var(--acc, #4f7cff) ${15 + (85 * n) / maxHeat}%, transparent)` : "var(--line)" }} />)])}
          <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="sub" style={{ margin: 0, fontSize: 10, textAlign: "center" }}>{h % 3 ? "" : h}</span>)}
        </div></div>
      </div>
    </>
  );
}
