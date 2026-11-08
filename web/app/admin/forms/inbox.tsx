"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Message } from "@/lib/contact";

const TABS: [string, string][] = [["held", "Spam / held"], ["sent", "Delivered"], ["rejected", "Rejected"], ["all", "All"]];
const KINDS: [string, string][] = [["", "Both forms"], ["contact", "Contact"], ["board", "Board"]];
const api = (method: string, body?: unknown, q = "") => fetch("/api/webmaster/forms" + q, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export default function Inbox({ initial, tab: t0, counts: n0 }: { initial: Message[]; tab: string; counts: Record<string, number> }) {
  const [tab, setTab] = useState(t0), [kind, setKind] = useState(""), [items, setItems] = useState(initial), [n, setN] = useState(n0), [msg, setMsg] = useState("");
  const load = async (t: string, k: string) => {
    setTab(t); setKind(k);
    const r = await (await fetch(`/api/webmaster/forms?status=${t}&kind=${k}`)).json(); setItems(r.messages); setN(r.counts);
  };
  const act = async (m: Message, action: "approve" | "reject" | "restore") => {
    const r = await api("PATCH", { id: m.id, action });
    if (!r.ok) return setMsg(await r.text());
    setMsg(action === "approve" ? "Approved and emailed." : "");
    load(tab, kind);
  };
  const del = async (m: Message) => {
    if (!(await confirmDialog("Delete this message for good?", { ok: "Delete", danger: true }))) return;
    await api("DELETE", undefined, `?id=${m.id}`); load(tab, kind);
  };
  const total = (n.held ?? 0) + (n.sent ?? 0) + (n.rejected ?? 0);
  return (
    <>
      <h1>Forms</h1>
      <p className="sub">Messages from the Contact page (contact@) and the Members → Contact the Board page (board@). Clean ones are emailed straight away; anything the spam filter dislikes waits here. Approve to email it, or reject it.</p>
      <nav className="bar" aria-label="Message status">
        {TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} style={tab === k ? { fontWeight: 700 } : undefined} onClick={() => load(k, kind)}>{l} ({k === "all" ? total : n[k] ?? 0})</button>)}
        <select aria-label="Which form" value={kind} onChange={(e) => load(tab, e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {msg && <span className="sub" role="status" style={{ margin: 0 }}>{msg}</span>}
      </nav>
      <div className="card">
        {items.map((m) => (
          <div key={m.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
            <div>
              <strong>{m.name}</strong> <a className="tag" href={`mailto:${m.email}`}>{m.email}</a>
              <span className="tag">{m.kind === "board" ? "Board form → board@" : "Contact form → contact@"}</span>
              <span className="tag">{new Date(m.created_at).toLocaleString()}</span>
              <span className="tag" style={{ fontWeight: 600 }}>{m.status === "sent" ? "Delivered" : m.status === "held" ? "Held" : "Rejected"}</span>
              {m.reason && <span className="tag" title="Why the filter held it">{m.reason}</span>}
            </div>
            {m.subject && <div style={{ fontWeight: 600, marginTop: 6 }}>{m.subject}</div>}
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 10px" }}>{m.message}</p>
            {m.status !== "sent" && <button className="pri" onClick={() => act(m, "approve")}>Approve &amp; send</button>}{" "}
            {m.status === "held" && <button onClick={() => act(m, "reject")}>Reject</button>}
            {m.status === "rejected" && <button onClick={() => act(m, "restore")}>Move back to held</button>}{" "}
            <button className="danger" onClick={() => del(m)}>Delete</button>
          </div>
        ))}
        {!items.length && <p className="sub">Nothing here.</p>}
      </div>
    </>
  );
}
