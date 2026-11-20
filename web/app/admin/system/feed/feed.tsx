"use client";
import { useState } from "react";
import Notice, { msgKind } from "@/components/notice";
import type { FeedConfig } from "@/feed/config";

// Phase 0: only the on/off switch. The sign-up and invitation settings (lobsters-embed.md, section 4) are added with the phases that use them.
export default function FeedAdmin({ initial, canWrite }: { initial: FeedConfig; canWrite: boolean }) {
  const [c, setC] = useState(initial), [msg, setMsg] = useState("");
  const save = async (enabled: boolean) => {
    const r = await fetch("/api/webmaster/feed", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...c, enabled }) });
    if (r.ok) { setC(await r.json()); setMsg("Saved. Every server picks it up within 30 seconds."); } else setMsg(await r.text());
  };
  return (
    <>
      <h1>Feed</h1>
      <p className="sub">The community link-sharing site at talk.kzoomakers.org. While it is off, that address shows "not found" and nothing is lost.</p>
      {msg && <Notice kind={msgKind(msg)}>{msg}</Notice>}
      <div className="card" style={{ padding: 12 }}>
        <label><input type="checkbox" disabled={!canWrite} checked={c.enabled} onChange={(e) => save(e.target.checked)} /> <b>Feed is on</b></label>
      </div>
    </>
  );
}
