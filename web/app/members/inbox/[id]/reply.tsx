"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Reply({ to }: { to: number }) {
  const [body, setBody] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), router = useRouter();
  return (
    <form style={{ display: "grid", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg("");
      const r = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "message", to, body }) }).catch(() => null);
      setBusy(false);
      if (r?.ok) { setBody(""); router.refresh(); } else setMsg(r ? await r.text() : "Network error. Try again.");
    }}>
      <textarea required minLength={5} maxLength={2000} rows={4} aria-label="Your reply" placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div><button className="btn btn-main btn-sm" disabled={busy}>Send reply</button></div>
      {msg && <p role="status" style={{ margin: 0 }}>{msg}</p>}
    </form>
  );
}
