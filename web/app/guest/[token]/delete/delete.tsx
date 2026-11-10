"use client";
import { useState } from "react";
import Notice from "@/components/notice";

export default function Delete({ token }: { token: string }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/guests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "requestDelete", t: token }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r ? await r.text() : "Couldn't reach the server. Try again.");
    const j = await r.json();
    setMsg(j.deleted ? "Your profile and all the personal data we held about you have been deleted." : j.text);
  };
  return <main className="card" style={{ maxWidth: 560, display: "grid", gap: 12 }}>
    <h1 style={{ margin: 0 }}>Delete my profile</h1>
    {msg ? <p role="status">{msg}</p> : <>
      <p>This asks us to delete your guest profile and everything we hold about you: your details, emergency contacts, signed agreement and photo ID.</p>
      <p className="sub">We keep guest records for a set time after your last visit, as you agreed when you signed. If that time hasn't passed yet, your deletion is scheduled for the day it ends.</p>
      <Notice kind="error">{err}</Notice>
      <button className="pri" disabled={busy} onClick={go} style={{ minHeight: 48 }}>{busy ? "Working…" : "Yes, delete my profile"}</button>
    </>}
  </main>;
}
