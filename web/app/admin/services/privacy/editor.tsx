"use client";
import { useState } from "react";
import Revisions from "../../webmaster/revisions";

export default function PrivacyEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial), [msg, setMsg] = useState(""), [saved, setSaved] = useState(0);
  const save = async () => {
    const r = await fetch("/api/webmaster/privacy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    setMsg(r.ok ? "Saved." : await r.text());
    setSaved(saved + 1);
  };
  return (
    <>
      <h1>Privacy statement</h1>
      <p className="sub">Shown at <a href="/privacy" target="_blank">/privacy</a>, in the site footer and at the bottom of the sign-in page. Start a section with <code>## Heading</code>, a bullet with <code>- </code>; any other line is a paragraph. Every change is recorded with who made it and can be reverted below.</p>
      {msg && <p className="sub" role="status">{msg}</p>}
      <div className="card" style={{ padding: 12 }}>
        <textarea style={{ width: "100%", fontFamily: "monospace" }} rows={28} aria-label="Privacy statement" value={text} onChange={(e) => { setMsg(""); setText(e.target.value); }} />
        <div className="bar"><button className="pri" onClick={save}>Save</button></div>
      </div>
      <Revisions<{ text: string }> api="/api/webmaster/privacy" reload={saved} lines={(d) => d.text.split("\n")}
        onRevert={async (r) => { setText((await r.json()).text); setMsg("Reverted."); }} />
    </>
  );
}
