"use client";
import { useState } from "react";

export default function DigestOptOut({ on }: { on: boolean }) {
  const [v, setV] = useState(on), [msg, setMsg] = useState("");
  const set = async (next: boolean) => {
    const r = await fetch("/api/members/training/digest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) });
    if (r.ok) { setV(next); setMsg("Saved."); } else setMsg(await r.text());
  };
  return (
    <section className="card" style={{ padding: 16, marginTop: 12 }}>
      <h3 style={{ margin: "0 0 4px" }}>Trainer email</h3>
      <label><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> Email me on Monday mornings with who is waiting on my tools</label>
      <p className="sub" style={{ margin: "6px 0 0" }}>{msg || "Nothing is sent when nobody is waiting."}</p>
    </section>
  );
}
