"use client";
import { useCallback, useEffect, useState } from "react";
import { Convo } from "./tour-thread";
import type { Msg } from "@/lib/contact";

/** Visitor side, opened from the link in a staff reply. */
export function MessageThread({ token }: { token: string }) {
  const [title, setTitle] = useState(""), [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`/api/contact/thread?token=${encodeURIComponent(token)}`);
    if (!r.ok) { const t = await r.text(); setErr(t); throw new Error(t); }
    const d = await r.json(); setTitle(d.title); return d.messages as Msg[];
  }, [token]);
  const send = useCallback(async (body: string) => {
    const r = await fetch("/api/contact/thread", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, body }) });
    if (!r.ok) throw new Error(await r.text());
  }, [token]);
  if (err) return <p role="alert" style={{ color: "#b3261e" }}>{err}</p>;
  return (
    <>
      {title && <p><strong>{title}</strong></p>}
      <Convo load={load} send={send} staff={false} other="Kzoo Makers" />
    </>
  );
}

/** Admin side: the conversation under one message. */
export function AdminReplies({ id, name }: { id: number; name: string }) {
  const load = useCallback(async () => { const r = await fetch(`/api/webmaster/forms?thread=${id}`); if (!r.ok) throw new Error("Couldn't load the conversation."); return (await r.json()) as Msg[]; }, [id]);
  const send = useCallback(async (body: string, internal: boolean) => {
    const r = await fetch("/api/webmaster/forms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, body, internal }) });
    if (!r.ok) throw new Error(await r.text());
  }, [id]);
  return <Convo load={load} send={send} staff other={name.split(" ")[0]} />;
}
