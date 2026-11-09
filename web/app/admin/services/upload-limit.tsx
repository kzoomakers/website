"use client";
import { useState } from "react";
import Notice from "@/components/notice";

// The biggest request signed-in people can upload, and the biggest anyone else can send to any page or form. Each has a fixed ceiling the server enforces.
export default function UploadLimit({ initial, max, maxPublic }: { initial: { mb: number; publicMb: number }; max: number; maxPublic: number }) {
  const [mb, setMb] = useState(String(initial.mb)), [pub, setPub] = useState(String(initial.publicMb)), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState(false);
  const save = async () => {
    setBusy(true); setMsg(""); setOk(false);
    const r = await fetch("/api/webmaster/upload-limit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mb: Number(mb), publicMb: Number(pub) }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setOk(true); else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  const num = (v: string, set: (x: string) => void, hi: number) => <input type="number" min={1} max={hi} step={1} value={v} onChange={(e) => { set(e.target.value); setOk(false); }} />;
  return (
    <div style={{ maxWidth: 560, marginTop: 32 }}>
      <h2>Upload size limits</h2>
      <p className="sub">In megabytes. People who are not signed in can only send small requests, so a stranger can't tie up the server with huge files. People who are signed in can upload bigger files, such as photos and IDs. A change takes up to a minute to reach every server.</p>
      <Notice kind="error">{msg}</Notice>
      <label>Signed in: largest upload (1 to {max} MB)
        {num(mb, setMb, max)}</label>
      <label>Not signed in: largest request to any page or form (1 to {maxPublic} MB, never more than the signed-in limit)
        {num(pub, setPub, maxPublic)}</label>
      <button className="pri" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      {ok && <p className="ok" role="status">✓ Saved</p>}
    </div>
  );
}
