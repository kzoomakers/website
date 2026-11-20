"use client";
import { useState } from "react";
import { useDirtyGuard } from "@/components/dirty-guard";
import { flushBurst } from "@/components/flush-burst";
import Revisions from "../revisions";

const api = "/api/webmaster/calendar";
const send = (method: string, body?: object) => fetch(api, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });

export default function CalendarAdmin({ initial }: { initial: string }) {
  const [url, setUrl] = useState(initial);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(0), [clean, setClean] = useState(0);
  const run = async (m: string, body: object | undefined, ok: string) => {
    const r = await send(m, body);
    setMsg(r.ok ? ok : await r.text());
    if (r.ok && m === "PUT") setClean(clean + 1);
    setSaved(saved + 1);
  };
  useDirtyGuard(url, clean);
  return (
    <>
      <h1>Calendar</h1>
      <p className="sub">The <a href="/calendar">calendar page</a> shows events from this .ics feed. The server caches the feed for an hour.</p>
      {msg && <p className="sub">{msg}</p>}
      <div className="bar">
        <input style={{ flex: 1 }} aria-label="Calendar feed URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="pri" onClick={() => run("PUT", { url }, "Saved.")}>Save link</button>
      </div>
      <div className="bar">
        <button onClick={() => { flushBurst(); run("POST", undefined, "Cache flushed. The next visit fetches the feed again."); }}>Flush cache</button>
      </div>
      <Revisions<{ url: string }> api={api} reload={saved} lines={(d) => [d.url]}
        onRevert={async (r) => { setUrl((await r.json()).url); setClean(clean + 1); setMsg("Reverted."); }} />
    </>
  );
}
