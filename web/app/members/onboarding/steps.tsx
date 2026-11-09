"use client";
import { useState } from "react";
import Flash from "@/components/flash";
import SignPad from "@/components/sign-pad";
import { Agreement, Changes } from "@/components/agreement";
import type { Change, Version } from "@/lib/waiver-diff";

// Only for members who must sign a newer agreement. First-time steps are the welcome wizard (members/wizard.tsx).
type Update = { last: string; changes: Change[]; notes: { revision: string; summary: string; at: string }[] } | null;
export default function Resign({ name, version, update }: { name: string; version: Version; update: Update }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const post = async (body: object) => { setBusy(true); setErr(""); const r = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setBusy(false); r.ok ? (location.href = "/members") : setErr(await r.text()); };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Flash msg={err} />
      {update && <section aria-label="What changed" style={{ display: "grid", gap: 10 }}>
          <div className="card" style={{ borderLeft: "4px solid #d6a21f" }}>
            <strong>In plain language: what's different since you last signed (revision {update.last})</strong>
            {update.notes.map((n) => <p key={n.revision} style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}><small className="sub">Revision {n.revision} · {new Date(n.at).toLocaleDateString()}</small><br />{n.summary}</p>)}
          </div>
          <h2 style={{ marginBottom: 0 }}>Section by section</h2>
          <Changes changes={update.changes} />
        </section>}
        <h2>{version.title} <small className="sub">revision {version.revision}</small></h2>
        <p className="sub">Please read the whole agreement, then sign at the bottom.</p>
        <article style={{ height: "calc(100vh - 440px)", minHeight: 240, resize: "both", overflow: "auto", maxWidth: "100%", minWidth: 280, border: "1px solid #ddd", borderRadius: 8, padding: 16, background: "#fff", color: "#111" }} tabIndex={0}><Agreement sections={version.sections} closing={version.closing} /></article>
        <p className="sub">When you sign, a PDF is emailed to you and to contact@kzoomakers.org, and kept encrypted. You can read every version you've signed on your Account page.</p>
        <SignPad name={name} busy={busy} initials drawRequired label="Sign the agreement" onSign={(signature, drawn, initials) => post({ step: "waiver", signature, initials, drawn })} />
    </div>
  );
}
