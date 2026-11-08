"use client";
import { useEffect, useState } from "react";

// Under the handbook's "Changes to Handbook and Policies" rule: signed-in members can ask to be emailed when the handbook changes.
export default function HandbookNotify() {
  const [st, setSt] = useState<{ signedIn: boolean; subscribed: boolean } | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [just, setJust] = useState(false);
  useEffect(() => { fetch("/api/handbook/updates", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setSt, () => {}); }, []);
  if (!st) return null;
  const set = async (on: boolean) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/handbook/updates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setSt({ ...st, subscribed: on }); setJust(on); } else setErr(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  if (!st.signedIn) return <p><a href={`/login?next=${encodeURIComponent("/handbook")}`} target="_top">Sign in</a> to be emailed when the handbook changes.</p>;
  return (
    <div style={{ margin: "12px 0" }}>
      {st.subscribed
        ? <p role="status" style={{ margin: 0 }}>✅ {just ? "Great! We'll let you know when something changes." : "You'll be emailed when the handbook changes."}{" "}
          <button type="button" disabled={busy} onClick={() => set(false)} style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Turn off</button></p>
        : <button type="button" className="btn btn-main" disabled={busy} onClick={() => set(true)}>🔔 Notify me by email of updates</button>}
      {err && <p role="alert" style={{ color: "#c62828", margin: "6px 0 0" }}>{err}</p>}
    </div>
  );
}
