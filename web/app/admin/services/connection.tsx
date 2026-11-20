"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { Card, Secret } from "./card";

export type Status = { kind: "ok" | "bad" | "off"; text: string };

// Test or save one connection. A save that works reloads the page (or, the very first time the database is set, goes on to the admin).
function useConnect(part: "db" | "s3", fields: Record<string, string>, configured: boolean, warn: string) {
  const [busy, setBusy] = useState(false), [res, setRes] = useState<{ error: string; tested: boolean } | null>(null);
  const go = async (test: boolean) => {
    if (!test && configured && !(await confirmDialog(warn, { ok: "Save and switch" }))) return;
    setBusy(true); setRes(null);
    const r = await fetch("/api/webmaster/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ part, test, ...fields }) }).catch(() => null);
    const j = r?.ok ? await r.json() : { error: r ? await r.text() : "Couldn't reach the server. Try again.", saved: false, first: false };
    setBusy(false); setRes({ error: j.error, tested: test });
    if (j.saved) setTimeout(() => (j.first ? (location.href = "/admin/webmaster") : location.reload()), 800);
  };
  const out = res && (res.error ? <p className="err" role="alert">✗ {res.error}</p> : <p className="ok" role="status">{res.tested ? "✓ Test passed (nothing saved)" : "✓ Saved"}</p>);
  const buttons = <div className="set-actions"><button disabled={busy} onClick={() => go(true)}>{busy ? "Working…" : "Test connection"}</button><button className="pri" disabled={busy} onClick={() => go(false)}>Test &amp; save</button></div>;
  return { buttons, out };
}

export function Database({ host, fromEnv, status }: { host?: string; fromEnv: boolean; status: Status }) {
  const [url, setUrl] = useState(""), [ca, setCa] = useState("");
  const { buttons, out } = useConnect("db", { databaseUrl: url, databaseCa: ca }, !!host, "This changes where ALL of the site's data lives. If the new database is empty, the site will look empty. Only continue if you mean to switch.");
  return (
    <Card title="Database" status={status} hint="The Postgres database that holds everything (pages, people, messages).">
      {host && <p>Connected to <b>{host}</b>{fromEnv && " (set by the DATABASE_URL environment variable, so it can only be changed there)"}.</p>}
      {!fromEnv && <>
        <Secret label="Connection URL" saved={!!host} value={url} set={setUrl} ph="postgres://user:pass@host:5432/db?sslmode=require" />
        <label>CA certificate (optional; Aiven provides one)<textarea rows={4} value={ca} placeholder="-----BEGIN CERTIFICATE-----" onChange={(e) => setCa(e.target.value)} /></label>
        {buttons}{out}
      </>}
    </Card>
  );
}

export function Storage({ s3, dbReady, status }: { s3?: { endpoint: string; bucket: string; region: string }; dbReady: boolean; status: Status }) {
  const [v, setV] = useState<Record<string, string>>({ endpoint: s3?.endpoint ?? "", bucket: s3?.bucket ?? "", region: s3?.region ?? "", accessKey: "", secretKey: "" });
  const set = (k: string) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const { buttons, out } = useConnect("s3", v, !!s3, "Uploaded files stay in the old bucket. After the switch, images and documents the site already has will stop loading unless they are copied over. Only continue if you mean to switch.");
  const F = (k: string, label: string, ph: string) => <label>{label}<input value={v[k]} placeholder={ph} onChange={(e) => set(k)(e.target.value)} /></label>;
  return (
    <Card title="File storage" status={status} hint="An S3-compatible bucket for uploaded photos, documents and signed PDFs. Blank keys keep the saved ones.">
      {!dbReady ? <p>Connect the database first; storage settings are kept in it.</p> : <>
        {F("endpoint", "Endpoint", "http://rustfs:9000")}{F("bucket", "Bucket (created if missing)", "uploads")}{F("region", "Region", "us-east-1")}
        <Secret label="Access key" saved={!!s3} value={v.accessKey} set={set("accessKey")} />
        <Secret label="Secret key" saved={!!s3} value={v.secretKey} set={set("secretKey")} />
        {buttons}{out}
      </>}
    </Card>
  );
}
