"use client";
import { useEffect, useState } from "react";

type Sum = { url: string; total: number; d7: number | null; d30: number | null; first_day: string; last_at: string | null };
type Det = { days: { day: string; n: number }[]; clicks: { at: string; ip: string; ua: string; screen: string; page: string }[] };

// Every link on the site that leaves kzoomakers.org, with how often it's clicked. Counters are kept forever.
export default function Links() {
  const [rows, setRows] = useState<Sum[] | null>(null), [err, setErr] = useState(""), [open, setOpen] = useState(""), [det, setDet] = useState<Det | null>(null);
  useEffect(() => { fetch("/api/webmaster/links", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setRows, () => setErr("Couldn't load.")); }, []);
  const show = async (url: string) => { if (open === url) return setOpen(""); setOpen(url); setDet(null); const r = await fetch("/api/webmaster/links?url=" + encodeURIComponent(url)); setDet(r.ok ? await r.json() : { days: [], clicks: [] }); };
  const max = Math.max(1, ...(det?.days.map((d) => d.n) ?? []));
  return (
    <>
      <h1>External links</h1>
      <p className="sub">Clicks on any link that leaves kzoomakers.org (Discord, partners, social…). New links appear here the first time someone clicks them. Daily counts are kept forever.</p>
      {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}
      {!rows && !err && <p>Loading…</p>}
      {rows && <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px 150px", gap: 10, padding: "6px 0", fontWeight: 600 }}><span>Link</span><span>Total</span><span>7 days</span><span>30 days</span><span>Last click</span></div>
        {rows.map((r) => (
          <div key={r.url} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}>
            <div onClick={() => show(r.url)} style={{ cursor: "pointer", display: "grid", gridTemplateColumns: "1fr 70px 70px 70px 150px", gap: 10 }}>
              <span style={{ wordBreak: "break-all" }}>{r.url}</span><strong>{r.total.toLocaleString()}</strong><span>{r.d7 ?? 0}</span><span>{r.d30 ?? 0}</span><span className="sub" style={{ margin: 0 }}>{r.last_at ? new Date(r.last_at).toLocaleString() : ""}</span>
            </div>
            {open === r.url && <div style={{ margin: "10px 0 4px" }}>
              {!det ? "Loading…" : <>
                <div className="sub" style={{ margin: "0 0 4px" }}>Clicks per day since {new Date(r.first_day).toLocaleDateString()}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 80, borderBottom: "1px solid var(--line)" }}>
                  {det.days.map((d) => <div key={d.day} title={`${d.day}: ${d.n}`} style={{ flex: 1, minWidth: 2, maxWidth: 24, height: `${Math.max(3, (d.n / max) * 100)}%`, background: "var(--acc)" }} />)}
                </div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, marginTop: 8 }}>
                  {det.clicks.map((c, i) => <div key={i} style={{ padding: "2px 0", wordBreak: "break-all" }}>{new Date(c.at).toLocaleString()} · {c.ip || "?"} · {c.screen || "?"} · from {c.page || "?"} · {c.ua}</div>)}
                </div>
              </>}
            </div>}
          </div>
        ))}
        {!rows.length && <p className="sub">No clicks yet.</p>}
      </div>}
    </>
  );
}
