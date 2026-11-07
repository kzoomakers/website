"use client";
import { useState } from "react";

// Download or restore the whole blog as import.json.
export default function Backup() {
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const restore = async (f?: File) => {
    if (!f) return;
    setBusy(true); setMsg("Importing…");
    const r = await fetch("/api/webmaster/blog-io", { method: "POST", headers: { "content-type": "application/json" }, body: f }).catch(() => null);
    setBusy(false);
    if (!r) return setMsg("Couldn't reach the server.");
    if (!r.ok) return setMsg(await r.text());
    const s = await r.json();
    setMsg(`Imported ${s.posts} posts (${s.created} new, ${s.updated} updated), ${s.categories} new categories, ${s.authors} new authors, ${s.media} images${s.mediaSkipped ? `, ${s.mediaSkipped} images skipped (storage not set up)` : ""}.${s.errors.length ? " Problems: " + s.errors.join("; ") : ""}`);
  };
  return (
    <div className="bar">
      <a href="/api/webmaster/blog-io"><button>Export import.json</button></a>
      <label><button type="button" disabled={busy} onClick={(e) => e.currentTarget.nextElementSibling instanceof HTMLInputElement && e.currentTarget.nextElementSibling.click()}>Import import.json…</button>
        <input type="file" accept="application/json,.json" hidden onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ""; }} /></label>
      {msg && <span className="sub" role="status" style={{ margin: 0 }}>{msg}</span>}
    </div>
  );
}
