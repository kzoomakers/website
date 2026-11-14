"use client";
import { useCallback, useEffect, useState } from "react";
import { tours } from "@/app/admin/tours/rpc";
import type { Msg } from "@/lib/tours";
import { Bar, CHAT_CSS, Msgs } from "./chat";

// A conversation: staff messages (emailed), visitor replies (from a link), and internal notes that only staff see.
export function Convo({ load, send, staff, other }: { load: () => Promise<Msg[]>; send: (body: string, internal: boolean) => Promise<void>; staff: boolean; other: string }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null), [body, setBody] = useState(""), [note, setNote] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const refresh = useCallback(() => load().then(setMsgs, (e) => setErr(e.message)), [load]);
  useEffect(() => { refresh(); }, [refresh]);
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault(); if (!body.trim() || busy) return;
    setBusy(true); setErr("");
    try { await send(body, note); setBody(""); await refresh(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const items = msgs && msgs.map((m) => ({ id: m.id, mine: staff ? m.kind === "staff" : m.kind === "visitor", note: m.kind === "note", name: m.author, body: m.body, at: m.created_at }));
  return (
    <div className="ch">
      <style>{CHAT_CSS}</style>
      {!msgs && !err && <p style={{ margin: 16 }}>Loading…</p>}
      <Msgs items={items} empty={`No messages yet.${staff ? ` Write one to email ${other}, or save a private note.` : ""}`} />
      {err && <p className="ch-err" role="alert">{err}</p>}
      {staff && <div className="ch-opt"><label><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> Internal note only (not emailed)</label></div>}
      <Bar value={body} set={setBody} go={go} busy={busy} note={note} label={staff ? "Message" : "Your reply"}
        placeholder={staff ? (note ? "Private note for the team. The visitor won't see this." : `Message to ${other}. They'll get it by email with a link to reply.`) : "Write a reply…"} />
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
