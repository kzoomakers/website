"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, Msgs, type Bub } from "@/components/chat";

// The member-to-member chat: bubbles plus a send bar. Sends, then reloads the page data so the new message appears.
export default function Chat({ to, name, items, canReply }: { to: number; name: string; items: Bub[]; canReply: boolean }) {
  const [body, setBody] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), router = useRouter();
  const go = async () => {
    if (body.trim().length < 5) return setMsg("Please write at least a few words.");
    setBusy(true); setMsg("");
    const r = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "message", to, body }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setBody(""); router.refresh(); } else setMsg(r ? await r.text() : "Network error. Try again.");
  };
  return (
    <div className="ch-main">
      <div className="ch-top">{name}</div>
      <Msgs items={items} />
      {msg && <p className="ch-err" role="status">{msg}</p>}
      {canReply ? <Bar value={body} set={setBody} go={go} busy={busy} label="Your reply" placeholder="Write a reply…" max={2000} /> : <p className="ch-err" style={{ color: "#626c76" }}>{name} isn't in the directory right now, so you can't reply.</p>}
    </div>
  );
}
