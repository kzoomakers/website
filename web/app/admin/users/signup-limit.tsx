"use client";
import Notice from "@/components/notice";
import { useState } from "react";

// New accounts are capped per hour to blunt sign-up floods; this shows the count and lets an admin clear it.
export default function SignupLimit({ used, limit, canEdit }: { used: number; limit: number; canEdit: boolean }) {
  const [n, setN] = useState(used), [err, setErr] = useState("");
  return (
    <p className="sub" role="status">
      Sign-ups this hour: <strong style={n >= limit ? { color: "var(--bad)" } : undefined}>{n} of {limit}</strong>{n >= limit && " (new sign-ups are paused)"}.{" "}
      {canEdit && n > 0 && <button onClick={async () => { const r = await fetch("/api/webmaster/signups", { method: "POST" }).catch(() => null); if (r?.ok) { setN(0); setErr(""); } else setErr("Couldn't reset. Try again."); }}>Reset counter</button>}
      {err && <Notice kind="error"> {err}</Notice>}
    </p>
  );
}
