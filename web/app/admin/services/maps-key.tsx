"use client";
import { useState } from "react";
import Notice from "@/components/notice";

// Google Maps API key for maps on the public site. Leave blank to turn maps off.
export default function MapsKey({ initial }: { initial: string }) {
  const [key, setKey] = useState(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState(false);
  const save = async () => {
    setBusy(true); setMsg(""); setOk(false);
    const r = await fetch("/api/webmaster/maps-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setOk(true); else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  return (
    <div style={{ maxWidth: 560, marginTop: 32 }}>
      <h2>Google Maps API key</h2>
      <p className="sub">Used for maps on the public site. This kind of key is visible to visitors' browsers, so in Google Cloud restrict it to this website's address (HTTP referrers) and to the Maps APIs you use. Blank turns it off.</p>
      <Notice kind="error">{msg}</Notice>
      <label>API key<input value={key} autoComplete="off" placeholder="AIza…" onChange={(e) => { setKey(e.target.value); setOk(false); }} /></label>
      <button className="pri" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      {ok && <p className="ok" role="status">✓ Saved</p>}
    </div>
  );
}
