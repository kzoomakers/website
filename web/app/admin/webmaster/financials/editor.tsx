"use client";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Fin } from "@/lib/financials";

const when = (s: string) => new Date(s).toLocaleString();

export default function FinancialsEditor() {
  const [org, setOrg] = useState("");
  const [files, setFiles] = useState<Fin[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/webmaster/financials").then((r) => r.json()).then((d) => { setOrg(d.org); setFiles(d.files); });
  useEffect(() => { load(); }, []);
  const send = async (init: RequestInit, ok: string, url = "/api/webmaster/financials") => {
    const r = await fetch(url, init);
    setMsg(r.ok ? ok : await r.text());
    if (r.ok) load();
    return r.ok;
  };
  const upload = async () => {
    if (!file) return setMsg("Choose a PDF first.");
    const fd = new FormData(); fd.set("year", year); fd.set("file", file);
    const replacing = files.some((f) => f.year === Number(year));
    if (replacing && !(await confirmDialog(`Replace the ${year} PDF?`, { ok: "Replace" }))) return;
    if (await send({ method: "POST", body: fd }, replacing ? `Replaced ${year}.` : `Uploaded ${year}.`)) setFile(null);
  };
  return (
    <>
      <h1>Financials</h1>
      <p className="sub">One PDF per year, shown on <a href="/financials" target="_blank">/financials</a>. The page and its Learn More menu link appear once something is uploaded.</p>
      {msg && <p className="sub" role="status">{msg}</p>}
      <div className="card" style={{ padding: 12 }}>
        <label>Organization name <input style={{ width: "100%" }} value={org} onChange={(e) => setOrg(e.target.value)} /></label>
        <div className="bar"><button className="pri" onClick={() => send({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ org }) }, "Saved.")}>Save name</button></div>
      </div>
      <h2>Upload or replace a PDF</h2>
      <div className="card" style={{ padding: 12 }}>
        <div className="bar">
          <label>Year <input type="number" min={1990} max={2100} style={{ width: 90 }} value={year} onChange={(e) => setYear(e.target.value)} /></label>
          <input type="file" accept="application/pdf" aria-label="PDF file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="pri" onClick={upload}>{files.some((f) => f.year === Number(year)) ? "Replace" : "Upload"}</button>
        </div>
        <small>Uploading a year that already has a PDF replaces it. 10MB max.</small>
      </div>
      <h2>Uploaded</h2>
      <div className="card">
        {!files.length && <div className="row">Nothing uploaded yet.</div>}
        {files.map((f) => (
          <div className="row" key={f.year}>
            <span className="grow"><a href={`/financials/${f.year}.pdf`} target="_blank">{f.year}</a> · {f.filename} · {Math.ceil(f.size / 1024)} KB</span>
            <span className="tag">Uploaded {when(f.uploaded_at)}{f.replaced_at && ` · Re-uploaded ${when(f.replaced_at)}`}</span>
            <button onClick={async () => { if (await confirmDialog(`Delete the ${f.year} PDF?`, { ok: "Delete" })) send({ method: "DELETE" }, `Deleted ${f.year}.`, `/api/webmaster/financials?year=${f.year}`); }}>Delete</button>
          </div>
        ))}
      </div>
    </>
  );
}
