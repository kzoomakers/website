"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { Banner, Card, Field, Steps, useSnack } from "./card";

type Info = { source: "db"; name: string; expires: string; generated: boolean; broken?: string } | { source: "env"; broken?: string } | null;

// Digital-signature certificate for finished PDFs: generate one, or upload a purchased .p12.
export default function Seal({ initial }: { initial: Info }) {
  const [info, setInfo] = useState<Info>(initial);
  const [org, setOrg] = useState("Kzoo Makers"), [pass, setPass] = useState(""), [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [snack, say] = useSnack();
  const call = async (body: BodyInit, done: string, json?: boolean) => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/webmaster/seal", { method: "POST", headers: json ? { "content-type": "application/json" } : undefined, body });
    if (r.ok) { setInfo(await r.json()); setFile(null); setPass(""); say(done); } else setMsg(await r.text());
    setBusy(false);
  };
  const op = (o: string, done: string) => call(JSON.stringify({ op: o, org }), done, true);
  const days = info?.source === "db" ? Math.floor((Date.parse(info.expires) - Date.now()) / 864e5) : undefined;
  const have = info?.source === "db";
  const replace = async () => !have || (await confirmDialog("Replace the current certificate? PDFs signed from now on use the new one; PDFs already signed are not changed.", { ok: "Replace" }));
  return (
    <Card title="Signing certificate">
      {info?.broken ? <Banner kind="bad" title="The certificate can’t be used">PDFs are being saved unsigned ({info.broken}). Generate or upload a new one below.</Banner>
        : info?.source === "env" ? <Banner kind="ok" title="Signing is on">Using the certificate set by the server’s SIGN_P12_* settings.</Banner>
        : info && days !== undefined && days < 30 ? <Banner kind="warn" title={days < 0 ? "The certificate has expired" : `The certificate expires in ${days} day${days === 1 ? "" : "s"}`}>“{info.name}” (valid until {info.expires.slice(0, 10)}). Replace it soon so PDFs stay signed.</Banner>
        : info ? <Banner kind="ok" title="Signing is on">{info.generated ? "Generated" : "Uploaded"} certificate “{info.name}”, valid until {info.expires.slice(0, 10)}.</Banner>
        : <Banner kind="off" title="No certificate yet">Finished PDFs are still hashed and encrypted, but not digitally signed.</Banner>}
      <p className="sub">A certificate lets Adobe prove a finished e-signed PDF wasn’t changed afterwards. A generated one shows as “unknown signer”; a purchased one shows as trusted. It is stored encrypted in the database.</p>
      {msg && <p className="err" role="alert">✗ {msg}</p>}
      {info?.source !== "env" && <>
        <h3>Generate one</h3>
        <Field label="Name on the certificate" value={org} set={setOrg} help="Usually the organization’s name." />
        <div className="set-actions"><button className="pri" disabled={busy || !org.trim()} onClick={async () => { if (await replace()) op("generate", "Certificate generated"); }}>{have ? "Generate a new one" : "Generate certificate"}</button></div>
        <Steps open={false}><li>Already bought a certificate? Choose its <b>.p12 / .pfx</b> file below and enter its passphrase.</li></Steps>
        <h3>Or upload a purchased one</h3>
        <label className="set-field"><span>Certificate file (.p12 or .pfx)</span><input type="file" accept=".p12,.pfx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <label className="set-field"><span>Passphrase</span><input type="password" value={pass} autoComplete="new-password" onChange={(e) => setPass(e.target.value)} /></label>
        <div className="set-actions">
          <button disabled={busy || !file} onClick={async () => { if (!file || !(await replace())) return; const d = new FormData(); d.set("file", file); d.set("pass", pass); call(d, "Certificate uploaded"); }}>Upload</button>
          {have && <button className="danger-text" disabled={busy} onClick={async () => { if (await confirmDialog("Remove the certificate? New PDFs will be saved unsigned.", { ok: "Remove" })) op("remove", "Certificate removed"); }}>Remove</button>}
        </div>
      </>}
      {snack}
    </Card>
  );
}
