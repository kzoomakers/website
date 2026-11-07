"use client";
import { useState } from "react";
import Revisions from "../revisions";

export default function RobotsEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(0);
  const save = async () => {
    const r = await fetch("/api/webmaster/robots", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    setMsg(r.ok ? "Saved." : await r.text());
    setSaved(saved + 1);
  };
  return (
    <>
      <h1>robots.txt</h1>
      <p className="sub">Tells search engines what they may crawl. Published at <a href="/robots.txt" target="_blank">/robots.txt</a>. A mistake here can hide the whole site from Google, so save carefully; every change can be reverted below.</p>
      {msg && <p className="sub" role="status">{msg}</p>}
      <div className="card" style={{ padding: 12 }}>
        <textarea style={{ width: "100%", fontFamily: "monospace" }} rows={16} aria-label="robots.txt" spellCheck={false} value={text} onChange={(e) => { setMsg(""); setText(e.target.value); }} />
        <div className="bar"><button className="pri" onClick={save}>Save</button></div>
      </div>
      <Revisions<{ text: string }> api="/api/webmaster/robots" reload={saved} lines={(d) => d.text.split("\n")}
        onRevert={async (r) => { setText((await r.json()).text); setMsg("Reverted."); }} />
    </>
  );
}
