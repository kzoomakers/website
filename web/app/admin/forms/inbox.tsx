"use client";
import { useState } from "react";
import Notice from "@/components/notice";
import { confirmDialog } from "@/components/dialog";
import type { Message } from "@/lib/contact";

const TABS: [string, string][] = [["held", "Held"], ["sent", "Delivered"], ["rejected", "Rejected"], ["all", "All"]];
const KINDS: [string, string][] = [["", "Both forms"], ["contact", "Contact"], ["board", "Board"]];
const api = (method: string, body?: unknown, q = "") => fetch("/api/webmaster/forms" + q, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export default function Inbox({ initial, tab: t0, counts: n0 }: { initial: Message[]; tab: string; counts: Record<string, number> }) {
  const [tab, setTab] = useState(t0), [kind, setKind] = useState(""), [items, setItems] = useState(initial), [n, setN] = useState(n0), [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false), [open, setOpen] = useState<number | null>(null);
  const say = (m: string, isBad = false) => { setMsg(m); setBad(isBad); };
  const load = async (t: string, k: string) => {
    setTab(t); setKind(k);
    const r = await fetch(`/api/webmaster/forms?status=${t}&kind=${k}`).catch(() => null);
    if (!r?.ok) return say("Couldn't load messages. Check your connection and try again.", true);
    const j = await r.json(); setItems(j.messages); setN(j.counts);
  };
  const act = async (m: Message, action: "approve" | "reject" | "restore") => {
    const r = await api("PATCH", { id: m.id, action }).catch(() => null);
    if (!r?.ok) return say(r ? await r.text() : "Couldn't reach the server. Try again.", true);
    say(action === "approve" ? "Approved and emailed." : "");
    load(tab, kind);
  };
  const del = async (m: Message) => {
    if (!(await confirmDialog("Delete this message permanently? You won't be able to get it back.", { ok: "Delete message", danger: true }))) return;
    const r = await api("DELETE", undefined, `?id=${m.id}`).catch(() => null);
    if (!r?.ok) return say("Couldn't delete that message. Try again.", true);
    load(tab, kind);
  };
  // Clears the whole list on screen one request at a time, stopping at the first failure.
  const all = async (what: "reject" | "delete") => {
    if (!(await confirmDialog(what === "delete" ? `Delete all ${items.length} messages shown, permanently?` : `Reject all ${items.length} held messages? Nothing is emailed.`, { ok: what === "delete" ? `Delete ${items.length}` : `Reject ${items.length}`, danger: true }))) return;
    for (const m of items) {
      const r = await (what === "delete" ? api("DELETE", undefined, `?id=${m.id}`) : api("PATCH", { id: m.id, action: "reject" })).catch(() => null);
      if (!r?.ok) { say("Stopped part-way: a message couldn't be updated. Try again.", true); break; }
    }
    load(tab, kind);
  };
  const total = (n.held ?? 0) + (n.sent ?? 0) + (n.rejected ?? 0);
  return (
    <>
      <h1>Messages</h1>
      <p className="sub">Messages from the Contact page (contact@) and the Contact the Board page (board@). Clean ones are emailed straight away; anything the spam filter catches waits here. Approve to email it, or reject it.</p>
      <div className="bar" role="group" aria-label="Message status">
        {TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} className={tab === k ? "pri" : ""} onClick={() => load(k, kind)}>{l} ({k === "all" ? total : n[k] ?? 0})</button>)}
        <select aria-label="Which form" value={kind} onChange={(e) => load(tab, e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {items.length > 1 && tab === "held" && <><button onClick={() => all("reject")}>Reject all</button><button className="danger" onClick={() => all("delete")}>Delete all</button></>}
      </div>
      <Notice kind={bad ? "error" : "success"} onClose={() => setMsg("")}>{msg}</Notice>
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
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 10px", ...(open === m.id || m.message.length < 300 ? {} : { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{m.message}</p>
            {m.message.length >= 300 && <button type="button" className="link" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)} style={{ border: 0, background: "none", color: "var(--acc)", padding: 0, marginBottom: 8 }}>{open === m.id ? "Show less" : "Read all"}</button>}
            {m.status !== "sent" && <button className="pri" onClick={() => act(m, "approve")}>Approve &amp; send</button>}{" "}
            {m.status === "held" && <button onClick={() => act(m, "reject")}>Reject</button>}
            {m.status === "rejected" && <button onClick={() => act(m, "restore")}>Move back to held</button>}{" "}
            <button className="danger" onClick={() => del(m)}>Delete</button>
          </div>
        ))}
        {!items.length && <p className="sub">{tab === "held" ? "No held messages. Anything the spam filter catches will wait here for you." : "No messages in this view."}</p>}
      </div>
    </>
  );
}
