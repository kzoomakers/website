"use client";
import { useState } from "react";

const F = ({ n, label, ph, v, set, area, pw }: { n: string; label: string; ph?: string; v: Record<string, string>; set: (k: string, x: string) => void; area?: boolean; pw?: boolean }) => (
  <label>
    {label}
    {area
      ? <textarea rows={4} placeholder={ph} value={v[n] ?? ""} onChange={(e) => set(n, e.target.value)} />
      : <input type={pw ? "password" : "text"} placeholder={ph} value={v[n] ?? ""} onChange={(e) => set(n, e.target.value)} />}
  </label>
);

export default function Form() {
  const [v, setV] = useState<Record<string, string>>({});
  const [res, setRes] = useState<{ db: string; s3: string; saved: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const go = async () => {
    setBusy(true);
    const r = await fetch("/api/webmaster/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
    const j = r.ok ? await r.json() : { db: await r.text(), s3: "", saved: false };
    setRes(j); setBusy(false);
    if (j.saved) setTimeout(() => (location.href = "/webmaster"), 1200);
  };
  const line = (name: string, e: string) => <p className={e ? "err" : "ok"}>{e ? `✗ ${name}: ${e}` : `✓ ${name} OK`}</p>;
  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Services</h1>
      <p className="sub">Connect the external services. Both are tested; if both pass, settings are saved and you continue to the admin.</p>
      <h2>Postgres</h2>
      <F n="databaseUrl" label="Connection URL" ph="postgres://user:pass@host:5432/db?sslmode=require" v={v} set={set} />
      <F n="databaseCa" label="CA certificate (optional; Aiven provides one)" ph="-----BEGIN CERTIFICATE-----" v={v} set={set} area />
      <h2>S3-compatible storage (uploads)</h2>
      <F n="endpoint" label="Endpoint" ph="http://rustfs:9000" v={v} set={set} />
      <F n="bucket" label="Bucket (created if missing)" ph="uploads" v={v} set={set} />
      <F n="region" label="Region" ph="us-east-1" v={v} set={set} />
      <F n="accessKey" label="Access key" v={v} set={set} />
      <F n="secretKey" label="Secret key" v={v} set={set} pw />
      <button className="pri" onClick={go} disabled={busy}>{busy ? "Testing…" : "Test & save"}</button>
      {res && <>{line("Postgres", res.db)}{line("Storage", res.s3)}{res.saved && <p>Saved. Loading the admin…</p>}</>}
    </div>
  );
}
