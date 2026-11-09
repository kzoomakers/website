"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { tours } from "@/app/admin/tours/rpc";
import type { Msg } from "@/lib/tours";

const CSS = `.tt{display:grid;gap:10px;font:inherit}.tt-m{color:#1a1a1a;max-width:min(560px,92%);padding:9px 13px;border-radius:12px;background:#eef0f3;justify-self:start}
.tt-m.me{background:#e3efff;justify-self:end}.tt-m.note{background:#fff8dc;border:1px dashed #d9b84a;justify-self:stretch;max-width:none}
.tt-w{font-size:12.5px;color:#555;margin-bottom:3px}.tt-w b{color:#1a1a1a}.tt-b{white-space:pre-wrap;overflow-wrap:anywhere}
.tt-f textarea{display:block;width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d5d9de;border-radius:8px;font:inherit}.tt-f .tt-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:8px}`;
const stamp = (d: string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// A conversation: staff messages (emailed), visitor replies (from a link), and internal notes that only staff see.
function Convo({ load, send, staff, other }: { load: () => Promise<Msg[]>; send: (body: string, internal: boolean) => Promise<void>; staff: boolean; other: string }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null), [body, setBody] = useState(""), [note, setNote] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const refresh = useCallback(() => load().then(setMsgs, (e) => setErr(e.message)), [load]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs?.length]);
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault(); if (!body.trim() || busy) return;
    setBusy(true); setErr("");
    try { await send(body, note); setBody(""); await refresh(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="tt">
      <style>{CSS}</style>
      {!msgs && !err && <p>Loading…</p>}
      {msgs && !msgs.length && <p className="sub" style={{ margin: 0 }}>No messages yet.{staff ? ` Write one to email ${other}, or save a private note.` : ""}</p>}
      {msgs?.map((m) => {
        const mine = staff ? m.kind === "staff" : m.kind === "visitor";
        return (
          <div key={m.id} className={`tt-m${mine ? " me" : ""}${m.kind === "note" ? " note" : ""}`}>
            <div className="tt-w"><b>{m.kind === "note" ? `🔒 Internal note · ${m.author}` : mine && !staff ? "You" : m.kind === "visitor" ? `${m.author} (visitor)` : `${m.author} (Kzoo Makers)`}</b> · {stamp(m.created_at)}</div>
            <div className="tt-b">{m.body}</div>
          </div>
        );
      })}
      <div ref={end} />
      <form className="tt-f" onSubmit={go}>
        <textarea aria-label={staff ? "Message" : "Your reply"} rows={3} maxLength={4000} value={body} placeholder={staff ? (note ? "Private note for the team. The visitor won't see this." : `Message to ${other}. They'll get it by email with a link to reply.`) : "Write your reply…"}
          onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); }} style={note ? { background: "#fff8dc", color: "#1a1a1a" } : undefined} />
        {body.length > 3000 && <small>{body.length}/4000</small>}
        <div className="tt-bar">
          {staff && <label style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> Internal note only (not emailed)</label>}
          {err && <span role="alert" style={{ color: "#b3261e" }}>{err}</span>}
          <button className="btn btn-main pri" disabled={busy || !body.trim()} style={{ marginLeft: "auto" }}>{busy ? "Sending…" : staff ? (note ? "Save note" : `Email ${other}`) : "Send reply"}</button>
        </div>
      </form>
    </div>
  );
}

/** Admin side: a collapsible conversation under a booking or walk-up request. */
export function AdminThread({ kind, id, name, msgs, lastFrom }: { kind: "booking" | "request"; id: number; name: string; msgs: number; lastFrom: string | null }) {
  const [open, setOpen] = useState(false);
  const load = useCallback(() => tours<Msg[]>("thread", { kind, id }), [kind, id]);
  const send = useCallback(async (body: string, internal: boolean) => void (await tours("post", { kind, id, body, internal })), [kind, id]);
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>💬 Conversation{msgs ? ` (${msgs})` : ""}{lastFrom === "visitor" && <b style={{ color: "#b3261e" }}> · new reply</b>}</button>
      {open && <div style={{ marginTop: 8, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}><Convo load={load} send={send} staff other={name.split(" ")[0]} /></div>}
    </div>
  );
}

/** Visitor side, opened from the link in a staff email. */
export default function Thread({ token }: { token: string }) {
  const [info, setInfo] = useState<{ title: string; name: string } | null>(null), [err, setErr] = useState("");
  const get = useCallback(async () => { const r = await fetch(`/api/tours/thread?token=${encodeURIComponent(token)}`); if (!r.ok) throw new Error(await r.text()); return r.json(); }, [token]);
  const load = useCallback(async () => { const d = await get(); setInfo({ title: d.title, name: d.name }); return d.messages as Msg[]; }, [get]);
  const send = useCallback(async (body: string) => {
    const r = await fetch("/api/tours/thread", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, body }) });
    if (!r.ok) throw new Error(await r.text());
  }, [token]);
  useEffect(() => { get().catch((e) => setErr(e.message)); }, [get]);
  if (err) return <p role="alert" style={{ color: "#b3261e" }}>{err}</p>;
  return (
    <>
      {info && <p><strong>{info.title}</strong></p>}
      <Convo load={load} send={send} staff={false} other="Kzoo Makers" />
      <p><small>Need to change your plans? Email <a href="mailto:contact@kzoomakers.org">contact@kzoomakers.org</a>.</small></p>
    </>
  );
}
