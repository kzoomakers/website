"use client";
import { useState } from "react";
import Notice from "@/components/notice";

// The biggest file anyone can upload (photos, IDs, art). The server also has a fixed ceiling, shown as the maximum.
export default function UploadLimit({ initial, max }: { initial: number; max: number }) {
  const [mb, setMb] = useState(String(initial)), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState(false);
  const save = async () => {
    setBusy(true); setMsg(""); setOk(false);
    const r = await fetch("/api/webmaster/upload-limit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mb: Number(mb) }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setOk(true); else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  return (
    <div style={{ maxWidth: 560, marginTop: 32 }}>
      <h2>Upload size limit</h2>
      <p className="sub">The largest file a member or staff member can upload, in megabytes. The most the server allows is {max} MB. A change takes up to a minute to reach every server.</p>
      <Notice kind="error">{msg}</Notice>
      <label>Largest upload (MB)<input type="number" min={1} max={max} step={1} value={mb} onChange={(e) => { setMb(e.target.value); setOk(false); }} /></label>
      <button className="pri" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      {ok && <p className="ok" role="status">✓ Saved</p>}
    </div>
  );
}
