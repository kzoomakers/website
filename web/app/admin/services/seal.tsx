"use client";
import { useState } from "react";

type Info = { source: "db"; name: string; expires: string; generated: boolean; broken?: string } | { source: "env"; broken?: string } | null;

// Digital-signature certificate for finished PDFs: generate one, or upload a purchased .p12.
export default function Seal({ initial }: { initial: Info }) {
  const [info, setInfo] = useState<Info>(initial);
  const [org, setOrg] = useState("Kzoo Makers"), [pass, setPass] = useState("");
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const call = async (body: BodyInit, json?: boolean) => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/webmaster/seal", { method: "POST", headers: json ? { "content-type": "application/json" } : undefined, body });
    if (r.ok) setInfo(await r.json()); else setMsg(await r.text());
    setBusy(false);
  };
  const op = (o: string) => call(JSON.stringify({ op: o, org }), true);
  return (
    <div style={{ maxWidth: 560, marginTop: 32 }}>
      <h2>Signed-PDF certificate</h2>
      <p className="sub">Finished e-signed PDFs are always hashed and encrypted. A certificate also lets Adobe prove the file wasn't altered afterwards. A generated one shows as “unknown signer”; an uploaded purchased certificate shows as trusted. It is stored encrypted in the database.</p>
      {info?.broken && <p className="err">✗ The stored certificate can't be used, so PDFs are being saved unsigned ({info.broken}). Generate or upload a new one.</p>}
      {info?.source === "db" && !info.broken && <p className="ok">✓ {info.generated ? "Generated" : "Uploaded"} certificate “{info.name}”, valid until {info.expires.slice(0, 10)}</p>}
      {info?.source === "env" && !info.broken && <p className="ok">✓ Using the SIGN_P12_* environment variables</p>}
      {!info && <p>No certificate yet: PDFs are not digitally signed.</p>}
      <label>Name on the certificate<input value={org} onChange={(e) => setOrg(e.target.value)} /></label>
      <button className="pri" disabled={busy || !org.trim()} onClick={() => op("generate")}>{info?.source === "db" ? "Generate a new one" : "Generate a certificate"}</button>
      <h3>Or upload a .p12</h3>
      <label>File<input type="file" accept=".p12,.pfx" id="p12" /></label>
      <label>Passphrase<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
      <button disabled={busy} onClick={() => { const f = (document.getElementById("p12") as HTMLInputElement).files?.[0]; if (!f) return setMsg("Choose a file first"); const d = new FormData(); d.set("file", f); d.set("pass", pass); call(d); }}>Upload</button>
      {info?.source === "db" && <button disabled={busy} onClick={() => op("remove")}>Remove</button>}
      {msg && <p className="err">✗ {msg}</p>}
    </div>
  );
}
