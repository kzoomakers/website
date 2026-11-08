"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/notifications";
import { ago } from "../admin/webmaster/ago";

// Top-right notifications: a gray wireframe envelope when there is nothing new, an orange filled one (with a count) when there is.
export default function Envelope() {
  const [d, setD] = useState<{ unread: number; notes: Note[] }>({ unread: 0, notes: [] });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const load = () => fetch("/api/notifications").then((r) => (r.ok ? r.json() : null)).then((x) => x && setD(x)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("mousedown", out); return () => removeEventListener("mousedown", out);
  }, []);
  const read = (body: object) => fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(load);
  const hot = d.unread > 0;
  return (
    <div className="env" ref={box}>
      <button className="env-btn" aria-label={hot ? `${d.unread} unread notifications` : "Notifications"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill={hot ? "#f59e0b" : "none"} stroke={hot ? "#d97706" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" style={{ opacity: hot ? 1 : 0.55 }}>
          <rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 6.5l9 6.5 9-6.5" fill="none" stroke={hot ? "#fff" : "currentColor"} />
        </svg>
        {hot && <span className="env-n">{d.unread > 9 ? "9+" : d.unread}</span>}
      </button>
      {open && (
        <div className="env-pop" role="menu">
          <div className="env-h"><b>Notifications</b>{hot && <button onClick={() => read({ all: true })}>Mark all read</button>}</div>
          {d.notes.slice(0, 8).map((n) => (
            <a key={n.id} role="menuitem" href={n.url || "/members/inbox"} className={n.read ? "env-i" : "env-i new"} onClick={() => n.read || read({ ids: [n.id] })}>
              <span>{n.title}</span>{n.body && <small>{n.body.slice(0, 80)}</small>}<small>{ago(n.at)}</small>
            </a>
          ))}
          {!d.notes.length && <p className="sub" style={{ padding: "8px 12px", margin: 0 }}>Nothing to see yet.</p>}
          <Link href="/members/inbox" className="env-all" onClick={() => setOpen(false)}>See all</Link>
        </div>
      )}
    </div>
  );
}
