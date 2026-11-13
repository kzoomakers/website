"use client";
import Notice from "@/components/notice";
import { useRef, useState } from "react";
import type { stats } from "@/lib/tours";
import { tours } from "../rpc";
import MailStats from "./mail-stats";

type S = Awaited<ReturnType<typeof stats>>;
const RANGES: [number, string][] = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "1 year"], [0, "All time"]];
const LABEL: Record<string, string> = { booked: "Still booked", no_show: "No-show", signed_up: "Signed up", sign_up_later: "Will sign up later", maybe_later: "Maybe later", no_interest: "Not interested" };
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MIN_TOURS = 3; // a close rate from fewer tours than this is noise, so it can't win "best close rate"
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const dur = (d: number | null) => (d == null ? "–" : d < 1 ? `${Math.round(d * 24)} h` : `${d.toFixed(1)} d`);
const short = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Colours by role. Blue and orange are the first two slots of the validated categorical palette; the outcome colours are status colours and always come with a label.
const CSS = `.st{--s1:#2a78d6;--s2:#eb6834;--good:#008300;--warn:#eda100;--bad:#e34948;--none:#8b929c;--open:#d5d9de}
@media (prefers-color-scheme:dark){.st{--s1:#3987e5;--s2:#d95926;--good:#2f9e2f;--warn:#c98500;--bad:#e66767;--none:#8b929c;--open:#3a3f47}}
.st .tip{position:absolute;pointer-events:none;background:var(--card,#fff);color:var(--ink,#111);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:13px;box-shadow:0 2px 8px #0003;white-space:nowrap;z-index:2}
.st .leg{display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 8px;font-size:13px}.st .leg i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:5px}
.st details{margin-top:8px}.st details table{border-collapse:collapse;font-size:13px}.st details td,.st details th{padding:2px 12px 2px 0;text-align:left}`;

function Kpi({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return <div className="card" style={{ flex: "1 1 160px", margin: 0 }}><div style={{ fontSize: 22 }} aria-hidden>{icon}</div><div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{value}</div><div style={{ fontWeight: 600 }}>{label}</div>{sub && <div className="sub" style={{ margin: 0 }}>{sub}</div>}</div>;
}
const Legend = ({ items }: { items: [string, string][] }) => <div className="leg">{items.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;
/** The numbers behind a chart, for people who can't use the picture. */
const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
  <details><summary>Show as a table</summary><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></details>
);

type Line = { name: string; color: string; ys: (number | null)[]; dashed?: boolean };
/** Lines over time with a crosshair: hover or touch anywhere to read every series at that point. `fmt` formats the value, `note` adds a line to the tooltip. */
function LineChart({ xs, lines, max, fmt = String, note, label, ticks = 4 }: { xs: string[]; lines: Line[]; max: number; fmt?: (n: number) => string; note?: (i: number) => string; label: string; ticks?: number }) {
  const [hov, setHov] = useState<number | null>(null), W = 700, H = 190, L = 40, R = 10, T = 8, B = 22, iw = W - L - R, ih = H - T - B;
  const x = (i: number) => L + (xs.length > 1 ? (iw * i) / (xs.length - 1) : iw / 2), y = (v: number) => T + ih - (ih * v) / (max || 1);
  const move = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W; setHov(Math.max(0, Math.min(xs.length - 1, Math.round(((px - L) / iw) * (xs.length - 1))))); };
  const path = (ys: (number | null)[]) => ys.map((v, i) => (v == null ? "" : `${ys.slice(0, i).some((p) => p != null) && ys[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(" ");
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => setHov(null)} style={{ touchAction: "pan-y" }}>
        {Array.from({ length: ticks + 1 }, (_, k) => { const v = (max * k) / ticks; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} /><text x={L - 6} y={y(v) + 4} fontSize={11} textAnchor="end" fill="var(--mut)">{fmt(Math.round(v * 100) / 100)}</text></g>; })}
        <text x={L} y={H - 4} fontSize={11} fill="var(--mut)">{xs[0] ? short(xs[0]) : ""}</text><text x={W - R} y={H - 4} fontSize={11} textAnchor="end" fill="var(--mut)">{xs.length ? short(xs[xs.length - 1]) : ""}</text>
        {lines.map((l) => <path key={l.name} d={path(l.ys)} fill="none" stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />)}
        {xs.length <= 40 && lines.filter((l) => !l.dashed).map((l) => l.ys.map((v, i) => (v == null ? null : <circle key={l.name + i} cx={x(i)} cy={y(v)} r={3.5} fill={l.color} stroke="var(--card,#fff)" strokeWidth={2} />)))}
        {hov != null && <g><line x1={x(hov)} x2={x(hov)} y1={T} y2={T + ih} stroke="var(--mut)" strokeWidth={1} />{lines.map((l) => (l.ys[hov] == null ? null : <circle key={l.name} cx={x(hov)} cy={y(l.ys[hov]!)} r={5} fill={l.color} stroke="var(--card,#fff)" strokeWidth={2} />))}</g>}
      </svg>
      {hov != null && <div className="tip" style={{ left: `${Math.min(80, Math.max(2, (100 * x(hov)) / W))}%`, top: 0, transform: x(hov) > W / 2 ? "translateX(-105%)" : "translateX(5%)" }}>
        <strong>{short(xs[hov])}</strong>{lines.map((l) => <div key={l.name}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: l.color, marginRight: 6 }} />{l.name}: {l.ys[hov] == null ? "–" : fmt(l.ys[hov]!)}</div>)}{note && <div className="sub" style={{ margin: 0 }}>{note(hov)}</div>}
      </div>}
    </div>
  );
}

/** Vertical bars with a native tooltip on each. */
function Columns({ rows, label, color = "var(--s1)" }: { rows: [string, number][]; label: string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1])), W = 700, H = 130, bw = W / Math.max(rows.length, 1);
  return rows.some((r) => r[1]) ? (
    <svg viewBox={`0 0 ${W} ${H + 34}`} width="100%" role="img" aria-label={label}>
      {rows.map(([k, n], i) => <g key={k}><rect x={i * bw + bw * 0.15} width={bw * 0.7} y={H - (H * n) / max} height={Math.max((H * n) / max, n ? 2 : 0)} rx={4} fill={color}><title>{`${k}: ${n}`}</title></rect>
        <text x={i * bw + bw / 2} y={H - (H * n) / max - 4} textAnchor="middle" fontSize={12} fill="var(--ink)">{n || ""}</text>
        <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize={11} fill="var(--mut)">{k}</text></g>)}
    </svg>
  ) : <p className="sub">Nothing yet.</p>;
}

/** Close rate per group: the bar is the rate, the label says how many tours it is built on. */
function RateBars({ rows }: { rows: { name: string; held: number; won: number }[] }) {
  return rows.length ? <>{rows.map((r) => (
    <div key={r.name} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 150px) 1fr 92px", gap: 8, alignItems: "center", margin: "6px 0" }} title={`${r.won} signed up of ${r.held} tours held`}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
      <span style={{ background: "var(--line)", borderRadius: 6, height: 14 }}><span style={{ display: "block", height: 14, borderRadius: 6, width: `${(100 * r.won) / (r.held || 1)}%`, background: "var(--s1)" }} /></span>
      <span style={{ textAlign: "right" }}><strong>{pct(r.won, r.held)}</strong> <small className="sub">{r.won}/{r.held}</small></span>
    </div>))}</> : <p className="sub">No tours held yet.</p>;
}

type Closer = S["closers"][number];
const OUTCOMES: [keyof Closer, string, string][] = [["won", "var(--good)", "Signed up"], ["later", "var(--warn)", "Later / maybe"], ["lost", "var(--none)", "Not interested"], ["noShow", "var(--bad)", "No-show"], ["unrecorded", "var(--open)", "Not recorded"]];
/** One row per guide: every held tour split by how it ended, all bars the same length so the shares compare. */
function Outcomes({ closers }: { closers: Closer[] }) {
  return closers.length ? <>
    <Legend items={OUTCOMES.map(([, c, l]) => [c, l])} />
    {closers.map((c) => (
      <div key={c.key} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 150px) 1fr 40px", gap: 8, alignItems: "center", margin: "6px 0" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>{c.name}</span>
        <span style={{ display: "flex", gap: 2, height: 16 }} role="img" aria-label={OUTCOMES.map(([k, , l]) => `${l} ${c[k]}`).join(", ")}>
          {OUTCOMES.map(([k, color, l]) => (c[k] as number) > 0 && <span key={k} title={`${l}: ${c[k]} of ${c.tours}`} style={{ flex: c[k] as number, background: color, borderRadius: 4, minWidth: 4 }} />)}
        </span>
        <small className="sub" style={{ textAlign: "right", margin: 0, lineHeight: 1 }}>{c.tours}</small>
      </div>))}
    <Table head={["Guide", "Tours held", ...OUTCOMES.map((o) => o[2])]} rows={closers.map((c) => [c.name, c.tours, ...OUTCOMES.map(([k]) => c[k] as number)])} />
  </> : <p className="sub">No tours held yet.</p>;
}

/** A ranked headline: who is first at something, with the runners up. */
function Board({ title, icon, rows, empty }: { title: string; icon: string; rows: { name: string; value: string; sub?: string }[]; empty?: string }) {
  return <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}><span aria-hidden>{icon}</span> {title}</h3>
    {rows.length ? <ol style={{ margin: 0, paddingLeft: 20 }}>{rows.map((r, i) => <li key={r.name} style={{ margin: "4px 0", fontWeight: i ? 400 : 700 }}>{r.name} <strong>{r.value}</strong>{r.sub && <small className="sub"> {r.sub}</small>}</li>)}</ol> : <p className="sub" style={{ margin: 0 }}>{empty ?? "Nothing yet."}</p>}
  </div>;
}

export default function Stats({ initial }: { initial: S }) {
  const [s, setS] = useState(initial), [days, setDays] = useState(90), [guide, setGuide] = useState(""), [err, setErr] = useState(""), latest = useRef({ d: 90, g: "" });
  const load = async (d: number, g: string) => { setDays(d); setGuide(g); latest.current = { d, g }; try { const r = await tours<S>("stats", { days: d, guide: g }); if (latest.current.d === d && latest.current.g === g) { setS(r); setErr(""); } } catch (e: any) { if (latest.current.d === d && latest.current.g === g) setErr(e.message); } };
  const top = [...s.closers].filter((c) => c.won).sort((a, b) => b.won - a.won || (a.days ?? 1e9) - (b.days ?? 1e9))[0];
  const live = s.total - s.cancelled, chart = s.series, maxDay = Math.max(1, ...chart.map((r) => r[1])), maxHeat = Math.max(1, ...s.heat.flat());
  const W = 700, H = 120, bw = W / Math.max(chart.length, 1);
  const who = s.guides.find((g) => g.key === guide)?.name;
  // Leaders and losses are built from the guide table (always everyone, whichever guide is picked above).
  const rated = s.closers.filter((c) => c.tours >= MIN_TOURS).map((c) => ({ ...c, rate: c.won / c.tours }));
  const rank = (rows: Closer[], f: (c: Closer) => number, fmt: (c: Closer) => string, sub?: (c: Closer) => string) => rows.filter((c) => f(c) > 0).sort((a, b) => f(b) - f(a)).slice(0, 5).map((c) => ({ name: c.name, value: fmt(c), sub: sub?.(c) }));
  const weeksOk = s.weeks.filter((w) => w.rate != null), overall = s.held ? s.won / s.held : 0;
  const wd = s.groups.weekday.map((g) => ({ ...g, name: DOW[+g.name] })).sort((a, b) => DOW.indexOf(a.name) - DOW.indexOf(b.name));
  return (
    <div className="st">
      <style>{CSS}</style>
      <h1>Statistics</h1>
      <p className="sub">How tours turn into members. “Closed” means a visitor was marked <em>signed up</em>; the closer is the tour’s guide. Ranges look at when the tour was booked. Rates only count tours that have already happened.</p>
      <div className="bar">
        {RANGES.map(([d, l]) => <button key={d} type="button" className={days === d ? "pri" : ""} aria-pressed={days === d} onClick={() => load(d, guide)}>{l}</button>)}
        <select aria-label="Tour guide" value={guide} onChange={(e) => load(days, e.target.value)}><option value="">All guides</option>{s.guides.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}</select>
        {err && <Notice kind="error">{err}</Notice>}
      </div>
      {who && <p className="sub">Showing {who} only. The guide table further down always lists everyone.</p>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Kpi icon="🗓️" label="Tours booked" value={live} sub={`${s.cancelled} cancelled · ${s.walkupTours} from walk-ups`} />
        <Kpi icon="🤝" label="Closed (signed up)" value={s.won} sub={`${pct(s.won, s.held)} of ${s.held} tours held`} />
        <Kpi icon="⏱️" label="Mean time to close" value={dur(s.days)} sub={s.estimated ? `booking → signed up (${s.estimated} estimated from the tour date)` : "booking → signed up"} />
        <Kpi icon="👻" label="No-show rate" value={pct(s.noShow, s.held)} sub={`${s.noShow} of ${s.held} tours held`} />
        <Kpi icon="🚶" label="Walk-up requests" value={s.requests} sub={`${s.requestsBooked} got a tour (${pct(s.requestsBooked, s.requests)})`} />
        <Kpi icon="🏆" label="Top closer" value={top?.name ?? "–"} sub={top ? `${top.won} sign-up${top.won === 1 ? "" : "s"} · ${pct(top.won, top.tours)} of tours held` : "no sign-ups yet"} />
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Burnup: tours booked and sign-ups</h2>
        <p className="sub">Running totals. The orange line is every tour booked; the blue line is how many of them turned into a member. The gap between them is the work still to convert.</p>
        <Legend items={[["var(--s2)", "Tours booked"], ["var(--s1)", "Signed up"]]} />
        {s.burnup.length ? <LineChart label="Burnup of tours booked and sign-ups" xs={s.burnup.map((b) => b.d)} max={Math.ceil(Math.max(4, ...s.burnup.map((b) => b.booked)) / 4) * 4}
          lines={[{ name: "Tours booked", color: "var(--s2)", ys: s.burnup.map((b) => b.booked) }, { name: "Signed up", color: "var(--s1)", ys: s.burnup.map((b) => b.won) }]}
          note={(i) => `${pct(s.burnup[i].won, s.burnup[i].booked)} of booked tours so far`} /> : <p className="sub">No bookings in this range.</p>}
        <Table head={[s.weekly ? "Week of" : "Day", "Tours booked", "Signed up"]} rows={s.burnup.map((b) => [b.d, b.booked, b.won])} />
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Conversion rate by week</h2>
        <p className="sub">Of the tours held that were booked in each week, the share that signed up. The dashed line is the average for this range ({pct(s.won, s.held)}). Weeks with no tours held are left out.</p>
        <Legend items={[["var(--s1)", "Signed up per tour held"]]} />
        {weeksOk.length ? <LineChart label="Conversion rate by week" xs={weeksOk.map((w) => w.d)} max={1} ticks={4} fmt={(n) => `${Math.round(n * 100)}%`}
          lines={[{ name: "Average", color: "var(--none)", dashed: true, ys: weeksOk.map(() => overall) }, { name: "Conversion", color: "var(--s1)", ys: weeksOk.map((w) => w.rate) }]}
          note={(i) => `${weeksOk[i].won} signed up of ${weeksOk[i].held} tours held`} /> : <p className="sub">No tours held in this range yet.</p>}
        <Table head={["Week of", "Tours held", "Signed up", "Rate"]} rows={weeksOk.map((w) => [w.d, w.held, w.won, pct(w.won, w.held)])} />
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Tour guides</h2>
        <p className="sub">Every tour held, split by how it ended. Bars are all the same length so you can compare shares; the number on the right is tours held.</p>
        <Outcomes closers={s.closers} />
        {s.closers.length > 0 && <div style={{ overflowX: "auto", marginTop: 12 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ textAlign: "left" }}><th>Guide</th><th>Tours held</th><th>Closed</th><th>Close rate</th><th>Not interested</th><th>No-shows</th><th>Mean time to close</th></tr></thead><tbody>
          {[...s.closers].sort((a, b) => b.won / (b.tours || 1) - a.won / (a.tours || 1) || b.won - a.won).map((c) => <tr key={c.key} style={{ borderTop: "1px solid var(--line)" }}><td>{c.name}{c === top && " 🏆"}</td><td>{c.tours}</td><td>{c.won}</td><td>{pct(c.won, c.tours)}{c.tours < MIN_TOURS && <small className="sub"> (few tours)</small>}</td><td>{c.lost}</td><td>{c.noShow}</td><td>{dur(c.days)}</td></tr>)}
        </tbody></table></div>}
      </div>

      <MailStats days={days} />

      <h2>Leaders and losses</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
        <Board title="Best close rate" icon="🥇" empty={`Needs a guide with ${MIN_TOURS}+ tours held.`} rows={[...rated].sort((a, b) => b.rate - a.rate || b.won - a.won).filter((c) => c.won).slice(0, 5).map((c) => ({ name: c.name, value: pct(c.won, c.tours), sub: `${c.won}/${c.tours}` }))} />
        <Board title="Most sign-ups" icon="🤝" rows={rank(s.closers, (c) => c.won, (c) => String(c.won), (c) => `of ${c.tours} tours`)} />
        <Board title="Fastest to close" icon="⚡" rows={s.closers.filter((c) => c.won && c.days != null).sort((a, b) => a.days! - b.days!).slice(0, 5).map((c) => ({ name: c.name, value: dur(c.days), sub: `${c.won} sign-up${c.won === 1 ? "" : "s"}` }))} />
        <Board title="Most “not interested”" icon="🧊" rows={rank(s.closers, (c) => c.lost, (c) => String(c.lost), (c) => `of ${c.tours} tours`)} empty="Nobody has lost one yet." />
        <Board title="Most “maybe later”" icon="⏳" rows={rank(s.closers, (c) => c.later, (c) => String(c.later), (c) => `of ${c.tours} tours`)} empty="None waiting." />
        <Board title="Most no-shows" icon="👻" rows={rank(s.closers, (c) => c.noShow, (c) => String(c.noShow), (c) => `of ${c.tours} tours`)} empty="Everyone turned up." />
        <Board title="Outcome not recorded" icon="📝" rows={rank(s.closers, (c) => c.unrecorded, (c) => String(c.unrecorded), (c) => `of ${c.tours} tours`)} empty="Every held tour has an outcome." />
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>How long it takes to sign up</h2>
        <p className="sub">Time from booking to “signed up”, for the {s.won} visitor{s.won === 1 ? "" : "s"} who joined.</p>
        <Columns rows={s.closeHist} label="Time from booking to sign-up" color="var(--s1)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <div className="card" style={{ margin: 0 }}><h2 style={{ marginTop: 0 }}>Close rate by interest</h2><p className="sub">Share who signed up, by what they wanted to see (one person can count in several).</p><RateBars rows={s.groups.interest} /></div>
        <div className="card" style={{ margin: 0 }}><h2 style={{ marginTop: 0 }}>Close rate by how they heard</h2><RateBars rows={s.groups.heard} /></div>
        <div className="card" style={{ margin: 0 }}><h2 style={{ marginTop: 0 }}>Close rate by tour day</h2><RateBars rows={wd} /></div>
        <div className="card" style={{ margin: 0 }}><h2 style={{ marginTop: 0 }}>Where tours end up</h2>
          {s.funnel.length ? s.funnel.map(([k, n]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", margin: "6px 0" }}><span>{LABEL[k] ?? k}</span><strong>{n}</strong></div>) : <p className="sub">Nothing yet.</p>}</div>
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>{s.weekly ? "Bookings per week" : "Bookings per day"}</h2>
        {chart.length ? <svg viewBox={`0 0 ${W} ${H + 16}`} width="100%" role="img" aria-label="Bookings over time">
          {chart.map(([d, n], i) => <rect key={d} x={i * bw + 1} width={Math.max(bw - 2, 1)} y={H - (H * n) / maxDay} height={(H * n) / maxDay} rx={2} fill="var(--s1)"><title>{`${d}: ${n}`}</title></rect>)}
          <text x={0} y={H + 13} fontSize={11} fill="var(--mut)">{chart[0][0]}</text><text x={W} y={H + 13} fontSize={11} textAnchor="end" fill="var(--mut)">{chart[chart.length - 1][0]}</text>
        </svg> : <p className="sub">No bookings in this range.</p>}
      </div>
      <div className="card"><h2 style={{ marginTop: 0 }}>When people book</h2><p className="sub">Day and hour the booking was made (club time). Darker means busier.</p>
        <div style={{ overflowX: "auto" }}><div style={{ display: "grid", gridTemplateColumns: "40px repeat(24, minmax(16px, 1fr))", gap: 2, minWidth: 560 }}>
          {s.heat.map((row, d) => [<span key={`l${d}`} className="sub" style={{ margin: 0 }}>{DOW[d].slice(0, 3)}</span>, ...row.map((n, h) => <span key={`${d}-${h}`} title={`${DOW[d]} ${h}:00 — ${n}`} style={{ height: 18, borderRadius: 3, background: n ? `color-mix(in srgb, var(--s1) ${15 + (85 * n) / maxHeat}%, transparent)` : "var(--line)" }} />)])}
          <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="sub" style={{ margin: 0, fontSize: 10, textAlign: "center" }}>{h % 3 ? "" : h}</span>)}
        </div></div>
      </div>
    </div>
  );
}
