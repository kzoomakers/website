"use client";
import { useState } from "react";

export default function Announce({ mode }: { mode: string }) {
  const [m, setM] = useState(mode), [msg, setMsg] = useState("");
  const set = async (v: string) => {
    const r = await fetch("/api/members/training/announce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: v }) });
    if (r.ok) { setM(v); setMsg("Saved."); } else setMsg(await r.text());
  };
  return (
    <section className="card" style={{ padding: 16, marginTop: 12 }}>
      <h3 style={{ margin: "0 0 4px" }}>Club Discord</h3>
      <label>Announce my new certifications in the club Discord{" "}
        <select value={m} onChange={(e) => set(e.target.value)}>
          <option value="">No, keep them private</option>
          <option value="first">Yes, with my first name</option>
          <option value="full">Yes, with my first name and Discord username</option>
        </select>
      </label>
      <p className="sub" style={{ margin: "6px 0 0" }}>{msg || "Turning this off stops future posts. Posts already in Discord stay until a Discord admin deletes them."}</p>
    </section>
  );
}
