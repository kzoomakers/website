"use client";
import { useState } from "react";

// Same relay the directory uses: the message lands in their inbox here (and by email); no address is revealed.
export default function Message({ to, name }: { to: number; name: string }) {
  const [body, setBody] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const r = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "message", to, body }) }).catch(() => null);
      setBusy(false);
      if (r?.ok) { setBody(""); setMsg("Sent. Replies appear in your Inbox."); } else setMsg(r ? await r.text() : "Network error.");
    }}>
      <textarea required minLength={5} maxLength={2000} rows={3} aria-label={`Message to ${name}`} placeholder="Say what you're working on and what you'd like help with." value={body} onChange={(e) => setBody(e.target.value)} style={{ width: "100%" }} />
      <button className="btn btn-main btn-sm" disabled={busy}>Message {name}</button> {msg && <span role="status" className="sub">{msg}</span>}
    </form>
  );
}
