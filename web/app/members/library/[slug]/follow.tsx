"use client";
import { useState } from "react";

// "Email me when this changes": a per-document opt-in. Saved at once; the checkbox reverts if the save fails.
export default function Follow({ slug, on }: { slug: string; on: boolean }) {
  const [v, setV] = useState(on), [err, setErr] = useState("");
  const set = async (next: boolean) => {
    setV(next); setErr("");
    const r = await fetch("/api/library/follow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, on: next }) }).catch(() => null);
    if (!r?.ok) { setV(!next); setErr(r ? await r.text() : "Couldn't save. Check your connection."); }
  };
  return <p><label><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> Email me when this changes</label>{err && <span role="alert"> {err}</span>}</p>;
}
