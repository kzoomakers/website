"use client";
import Notice from "@/components/notice";
import Link from "next/link";
import { useEffect, useState } from "react";
import { markLabel } from "@/lib/mail-track";
import { pct, rpc, when } from "./api";
import { Recipients } from "./emails";

const r1 = (n: number) => Math.round(n * 10) / 10;
const rate = (a: number, b: number) => (b ? (100 * a) / b : 0);
const span = (sec: number | null) => (sec == null ? "–" : sec < 90 ? "under 2 min" : sec < 5400 ? `${Math.round(sec / 60)} min` : sec < 172800 ? `${r1(sec / 3600)} h` : `${r1(sec / 86400)} days`);
const hr = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

type Series = { name: string; color: string; ys: number[] };
/** Lines over labelled steps. Every point has a tooltip, and the numbers are in the table underneath for anyone who can't use the picture. */
function Lines({ xs, series, max, unit = "%", label }: { xs: string[]; series: Series[]; max: number; unit?: string; label: string }) {
  const W = 700, H = 200, L = 40, R = 12, T = 8, B = 26, x = (i: number) => L + (xs.length > 1 ? ((W - L - R) * i) / (xs.length - 1) : 0), y = (v: number) => T + (H - T - B) * (1 - v / (max || 1));
  return (
    <>
      <div className="trk-leg">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" /><text x={L - 6} y={y(max * f) + 4} fontSize={11} textAnchor="end" fill="var(--mut)">{r1(max * f)}{unit}</text></g>)}
        {xs.map((l, i) => (xs.length <= 14 || i % Math.ceil(xs.length / 10) === 0) && <text key={i} x={x(i)} y={H - 8} fontSize={11} textAnchor="middle" fill="var(--mut)">{l}</text>)}
        {series.map((s) => <g key={s.name}><path d={s.ys.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
          {s.ys.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color}><title>{`${s.name}, ${xs[i]}: ${r1(v)}${unit}`}</title></circle>)}</g>)}
      </svg>
      <details><summary>Show as a table</summary><table className="mp-table"><thead><tr><th /><>{series.map((s) => <th key={s.name}>{s.name}</th>)}</></tr></thead>
        <tbody>{xs.map((l, i) => <tr key={i}><td>{l}</td>{series.map((s) => <td key={s.name}>{r1(s.ys[i])}{unit}</td>)}</tr>)}</tbody></table></details>
    </>
  );
}
function Cols({ rows, color, label, fmt = String }: { rows: [string, number][]; color: string; label: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1])), W = 700, H = 120, bw = W / rows.length;
  return rows.some((r) => r[1]) ? (
    <svg viewBox={`0 0 ${W} ${H + 36}`} width="100%" role="img" aria-label={label}>
      {rows.map(([k, n], i) => <g key={k}><rect x={i * bw + bw * 0.12} width={bw * 0.76} y={H - (H * n) / max} height={Math.max((H * n) / max, n ? 2 : 0)} rx={4} fill={color}><title>{`${k}: ${fmt(n)}`}</title></rect>
        <text x={i * bw + bw / 2} y={H - (H * n) / max - 4} textAnchor="middle" fontSize={11} fill="var(--ink)">{n ? fmt(n) : ""}</text>
        <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize={rows.length > 12 ? 10 : 11} fill="var(--mut)">{k}</text></g>)}
    </svg>
  ) : <p className="sub">Nothing yet.</p>;
}
/** One bar split into parts that add up to everyone. */
function Split({ parts, label }: { parts: [string, number, string][]; label: string }) {
  const total = parts.reduce((a, p) => a + p[1], 0) || 1;
  return (
    <>
      <div className="trk-split" role="img" aria-label={label}>{parts.filter((p) => p[1]).map(([n, v, c]) => <span key={n} style={{ width: `${(100 * v) / total}%`, background: c }} title={`${n}: ${v} (${Math.round((100 * v) / total)}%)`} />)}</div>
      <div className="trk-leg">{parts.map(([n, v, c]) => <span key={n}><i style={{ background: c }} />{n}: <b>{v}</b> ({pct(v, total)})</span>)}</div>
    </>
  );
}
const Kpi = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => <div className="card trk-kpi"><div className="trk-n">{value}</div><div>{label}</div>{sub && <small>{sub}</small>}</div>;
const Lock = () => <p className="sub">🔒 Who opened or clicked is only shown to site administrators, for privacy. Everyone else sees the totals above.</p>;

export default function Tracking({ id }: { id?: number }) {
  return <div className="trk">{id ? <Report id={id} /> : <Overview />}</div>;
}

function Overview() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState("");
  useEffect(() => { rpc("trackingOverview").then(setD).catch((e) => setErr(e.message)); }, []);
  if (!d) return <p>{err || "Loading…"}</p>;
  const em: any[] = d.emails, last = em.slice(-10), avg = (k: string) => (last.length ? last.reduce((a, e) => a + rate(e[k], e.sent), 0) / last.length : 0), sg = d.segments;
  return (
    <>
      <h1>Tracking</h1>
      <p className="sub">How people engage with the emails you send. Opens come from a 1×1 image at the bottom of each email and clicks from links that pass through this site first. Both only count what mail apps allow, so treat opens as a good guide, not a head count. Click an email for the full picture.</p>
      {(!d.trackOpens || !d.trackClicks) && <Notice kind="info">{!d.trackOpens && !d.trackClicks ? "Open and click tracking are both off" : !d.trackOpens ? "Open tracking is off" : "Click tracking is off"} under <Link href="/admin/mailer/settings">Settings</Link>, so new emails won't record that.</Notice>}
      <div className="trk-kpis">
        <Kpi label="Average open rate" value={`${Math.round(avg("opened"))}%`} sub={`last ${last.length} emails`} />
        <Kpi label="Average click rate" value={`${Math.round(avg("clicked"))}%`} sub={`last ${last.length} emails`} />
        <Kpi label="Average unsubscribes" value={`${r1(avg("unsubscribed"))}%`} sub={`last ${last.length} emails`} />
        <Kpi label="Engaged readers" value={sg ? pct(sg.engaged, sg.engaged + sg.lapsed + sg.never) : "–"} sub="opened something in 90 days" />
      </div>
      {em.length > 1 && <div className="card"><h2>Every email, side by side</h2><p className="sub">Open and click rate for your last {em.length} emails, oldest to newest. Is it climbing, or sliding?</p>
        <Lines label="Open and click rate by email" xs={em.map((e) => new Date(e.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} max={Math.max(10, Math.ceil(Math.max(...em.map((e) => rate(e.opened, e.sent))) / 10) * 10)}
          series={[{ name: "Opened", color: "var(--t1)", ys: em.map((e) => rate(e.opened, e.sent)) }, { name: "Clicked", color: "var(--t2)", ys: em.map((e) => rate(e.clicked, e.sent)) }]} /></div>}
      {sg && <div className="card"><h2>Your subscribers</h2><p className="sub">Everyone currently subscribed, by how they read your email. “Cooling off” people used to open but haven't in 90 days; “never opened” people are the ones to win back or let go.</p>
        <Split label="Subscribers by engagement" parts={[["Engaged", sg.engaged, "var(--t1)"], ["Cooling off", sg.lapsed, "var(--t3)"], ["Never opened", sg.never, "var(--t4)"], ["Not emailed yet", sg.fresh, "var(--open)"]]} /></div>}
      <table className="mp-table"><thead><tr><th>Email</th><th>Sent to</th><th>Opened</th><th>Clicked</th><th>Unsubscribed</th></tr></thead>
        <tbody>{[...em].reverse().map((e) => <tr key={e.id}><td><Link href={`/admin/mailer/tracking/${e.id}`}><b>{e.subject || "(no subject)"}</b></Link><br /><small>{when(e.sent_at)}</small></td><td>{e.sent}</td><td>{pct(e.opened, e.sent)}</td><td>{pct(e.clicked, e.sent)}</td><td>{pct(e.unsubscribed, e.sent)}</td></tr>)}</tbody></table>
      {!em.length && <p className="sub">No emails sent yet. Numbers show up here after your first send.</p>}
    </>
  );
}

function Report({ id }: { id: number }) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState("");
  useEffect(() => { rpc("trackingReport", { id }).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (!d) return <p>{err || "Loading…"}</p>;
  const n = d.sent, vs = (mine: number, theirs: number | null) => (theirs == null ? "" : `${mine >= theirs * 100 ? "+" : ""}${r1(mine - theirs * 100)} points vs your last ${d.benchmark.n}`);
  const op = rate(d.opened, n), cl = rate(d.clicked, n), curve: { min: number; opened: number; clicked: number }[] = d.curve;
  return (
    <>
      <p><Link href="/admin/mailer/tracking">← All tracking</Link></p>
      <h1>{d.campaign.subject || d.campaign.name}</h1>
      <p className="sub">Sent {when(d.campaign.sent_at)} to {n} {n === 1 ? "person" : "people"}{d.failed ? `, ${d.failed} failed to deliver` : ""}.</p>
      <div className="trk-kpis">
        <Kpi label="Opened" value={pct(d.opened, n)} sub={vs(op, d.benchmark.opened) || `${d.opened} people`} />
        <Kpi label="Clicked a link" value={pct(d.clicked, n)} sub={vs(cl, d.benchmark.clicked) || `${d.clicked} people`} />
        <Kpi label="Of openers, clicked" value={pct(d.clicked, d.opened)} sub="the email's pull" />
        <Kpi label="Opened more than once" value={pct(d.repeat, d.opened)} sub={`${d.repeat} people`} />
        <Kpi label="Unsubscribed" value={pct(d.unsubscribed, n)} sub={`${d.unsubscribed} people`} />
      </div>
      <div className="card"><h2>How fast people responded</h2>
        <p className="sub">{d.medianSec == null ? "Nobody has opened it yet." : <>Half of the people who opened did so within <b>{d.halfMin ? markLabel(d.halfMin) : "the first weeks"}</b> of sending; the typical open came <b>{span(d.medianSec)}</b> after. The lines climb as more people get to it, so a flat line means the email has run its course.</>}</p>
        <Lines label="Share of recipients who opened and clicked over time since sending" xs={curve.map((c) => markLabel(c.min))} max={Math.max(10, Math.ceil(Math.max(op, 1) / 10) * 10)} series={[{ name: "Opened", color: "var(--t1)", ys: curve.map((c) => rate(c.opened, n)) }, { name: "Clicked", color: "var(--t2)", ys: curve.map((c) => rate(c.clicked, n)) }]} />
      </div>
      <div className="card"><h2>Who engaged</h2>
        <Split label="Recipients by what they did" parts={[["Clicked", d.clicked, "var(--t2)"], ["Opened, no click", d.opened - d.clicked, "var(--t1)"], ["Didn't open", n - d.opened, "var(--open)"]]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
        <div className="card"><h2>Time to first open</h2><Cols label="How long after sending people first opened" rows={d.speed} color="var(--t1)" /></div>
        <div className="card"><h2>When people opened</h2><p className="sub">Hour of day (club time) of each person's first open.</p>
          <Cols label="First opens by hour of day" rows={d.hours.map((v: number, h: number) => [h % 3 === 0 ? hr(h) : String(h), v] as [string, number])} color="var(--t3)" /></div>
      </div>
      <div className="card"><h2>Links</h2>
        {d.links.length ? <table className="mp-table"><thead><tr><th>Link</th><th>People</th><th>Of recipients</th><th>Clicks</th></tr></thead>
          <tbody>{d.links.map((l: any) => <tr key={l.url}><td style={{ wordBreak: "break-all" }}>{l.url}</td><td>{l.people}</td><td><span className="trk-bar"><i style={{ width: `${Math.min(100, rate(l.people, n))}%` }} /></span> {pct(l.people, n)}</td><td>{l.clicks}</td></tr>)}</tbody></table> : <p className="sub">No link clicks yet.</p>}
      </div>
      <div className="card"><h2>Who clicked and when</h2>{d.admin ? <ClickLog id={id} /> : <Lock />}</div>
      {d.admin && <div className="card"><Recipients id={id} /></div>}
      <p className="sub">Opens are counted when the email's tiny image loads: mail apps that load images automatically (Apple Mail) make it look higher, and ones that block images make it look lower. Clicks are the firmer number.</p>
    </>
  );
}

function ClickLog({ id }: { id: number }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { rpc("clickLog", { id }).then(setRows).catch(() => setRows([])); }, [id]);
  return !rows ? <p>Loading…</p> : !rows.length ? <p className="sub">No clicks yet.</p> : (
    <div style={{ maxHeight: 360, overflow: "auto" }}><table className="mp-table"><thead><tr><th>Person</th><th>When</th><th>Link</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{r.email}{r.name && <><br /><small>{r.name}</small></>}</td><td>{when(r.at)}</td><td style={{ wordBreak: "break-all" }}><small>{r.url}</small></td></tr>)}</tbody></table></div>
  );
}
