"use client";
import { useEffect, useState } from "react";
import type { mailStats } from "@/lib/tours";
import { MAIL_KIND } from "@/lib/tours-fmt";
import { tours } from "../rpc";
import { after } from "../email-trail";

type M = Awaited<ReturnType<typeof mailStats>>;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const hr = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

/** Email engagement for the range picked on the Statistics page: how each kind of email does, and when people read. */
export default function MailStats({ days }: { days: number }) {
  const [m, setM] = useState<M | null>(null);
  useEffect(() => { let on = true; tours<M>("mailStats", { days }).then((r) => on && setM(r)).catch(() => {}); return () => { on = false; }; }, [days]);
  if (!m) return null;
  const max = Math.max(1, ...m.hours), top = m.hours.indexOf(Math.max(...m.hours));
  return (
    <div className="card"><h2 style={{ marginTop: 0 }}>Email engagement</h2>
      <p className="sub">Of the emails we sent visitors, how many were opened and how many had a link clicked. Opens come from a tiny image, so mail apps that load images automatically (Apple Mail) overcount and apps that block them undercount; clicks are the firmer number.</p>
      {m.kinds.length ? m.kinds.map((k) => (
        <div key={k.kind} style={{ margin: "10px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b>{MAIL_KIND[k.kind] ?? k.kind}</b><span className="sub" style={{ margin: 0 }}>{k.sent} sent{k.median_min != null && ` · typically opened ${after(k.median_min * 6e4)} after sending`}</span></div>
          {([["Opened", k.opened, "var(--s1)"], ["Clicked", k.clicked, "var(--s2)"]] as const).map(([l, n, c]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><span style={{ width: 60 }}>{l}</span>
              <span style={{ flex: 1, background: "var(--open)", borderRadius: 4, height: 10 }} role="img" aria-label={`${l}: ${pct(n, k.sent)}%`}><span style={{ display: "block", width: `${pct(n, k.sent)}%`, height: 10, borderRadius: 4, background: c }} /></span>
              <span style={{ width: 90 }}>{pct(n, k.sent)}% ({n})</span></div>
          ))}
        </div>
      )) : <p className="sub">No tracked emails in this range yet.</p>}
      {m.hours.some(Boolean) && <>
        <h3>When people open email</h3>
        <p className="sub">Opens by hour of day (club time). Busiest around {hr(top)}: a good time to send.</p>
        <svg viewBox="0 0 700 110" width="100%" role="img" aria-label="Opens by hour of day">
          {m.hours.map((n, h) => <g key={h}><rect x={h * 29 + 3} width={23} y={90 - (80 * n) / max} height={Math.max((80 * n) / max, n ? 2 : 0)} rx={3} fill="var(--s1)"><title>{`${hr(h)}: ${n} opens`}</title></rect>{h % 3 === 0 && <text x={h * 29 + 14} y={106} textAnchor="middle" fontSize={11} fill="var(--mut)">{hr(h)}</text>}</g>)}
        </svg>
      </>}
    </div>
  );
}
