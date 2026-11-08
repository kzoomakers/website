"use client";
import { useState } from "react";

export default function Start({ token }: { token: string }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  return (
    <form className="card" style={{ display: "grid", gap: 10 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr("");
      const r = await fetch("/api/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "direct", token, name, email }) });
      if (r.ok) location.href = "/sign/" + (await r.json()).token; else { setErr(await r.text()); setBusy(false); }
    }}>
      <p className="sub" style={{ margin: 0 }}>Tell us who you are, then you'll review and sign the document. A signed copy is emailed to you.</p>
      <label>Your full name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" style={{ width: "100%", boxSizing: "border-box" }} /></label>
      <label>Your email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" style={{ width: "100%", boxSizing: "border-box" }} /></label>
      {err && <p role="alert" style={{ color: "#b00020", margin: 0 }}>{err}</p>}
      <button className="pri" disabled={busy}>{busy ? "One moment…" : "Continue"}</button>
    </form>
  );
}
