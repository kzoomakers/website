"use client";
import { useEffect, useState } from "react";

type Ev = { id: number; kind: "message" | "state"; to_state: string | null; body: string; at: string; mine: boolean };
type V = { name: string; approval: string; events: Ev[] };
const HEAD: Record<string, [string, string]> = {
  pending: ["We're reviewing your application", "Nothing more is needed from you right now. We'll email you as soon as there's news."],
  waiting: ["We need a reply from you", "The team asked you something. Your answer goes back to them as soon as you send it."],
  rejected: ["We couldn't approve this account", "The details are below."],
};
const STATE_LINE: Record<string, string> = { pending: "Under review", waiting: "Waiting for your reply", rejected: "Not approved", approved: "Approved" };

// The applicant's side of the approval thread: where things stand, the conversation so far, and a box to answer.
export default function Status() {
  const [v, setV] = useState<V | null>(null), [text, setText] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const load = () => fetch("/api/pending", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: V) => { if (d.approval === "approved") location.reload(); else setV(d); }, () => setErr("Couldn't load your application. Reload to try again."));
  useEffect(() => { load(); window.addEventListener("focus", load); return () => window.removeEventListener("focus", load); }, []);
  if (!v) return <div>{err ? <p role="alert">{err}</p> : <p>Loading…</p>}</div>;
  const [h, sub] = HEAD[v.approval] ?? HEAD.pending, open = v.approval === "pending" || v.approval === "waiting";
  return (
    <div style={{ maxWidth: 560, display: "grid", gap: 20 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7 }}>Hi {v.name}</p>
        <h2 style={{ margin: "4px 0 6px" }}>{h}</h2>
        <p role="status" style={{ margin: 0 }}>{sub}</p>
      </header>
      {v.approval === "waiting" && <p style={{ background: "#fff4d6", color: "#4a3500", padding: "10px 14px", borderRadius: 8, margin: 0 }}>Reply below to move your application forward.</p>}
      <ol aria-label="Conversation" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {v.events.map((e) => e.kind === "state"
          ? <li key={e.id} style={{ textAlign: "center", fontSize: 14, opacity: 0.75 }}>{STATE_LINE[e.to_state ?? ""] ?? e.to_state} · {new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}{e.body && e.to_state === "rejected" ? <div style={{ marginTop: 4, whiteSpace: "pre-wrap", opacity: 1 }}>{e.body}</div> : null}</li>
          : <li key={e.id} style={{ justifySelf: e.mine ? "end" : "start", maxWidth: "85%", background: e.mine ? "#e8f0fe" : "#f1f1f1", color: "#1a1a1a", padding: "8px 12px", borderRadius: 12 }}>
              <small style={{ opacity: 0.7 }}>{e.mine ? "You" : "Kzoo Makers team"} · {new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small>
              <div style={{ whiteSpace: "pre-wrap" }}>{e.body}</div>
            </li>)}
      </ol>
      {open && (
        <form style={{ display: "grid", gap: 8 }} onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr("");
          const r = await fetch("/api/pending", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text }) }).catch(() => null);
          setBusy(false);
          if (r?.ok) { setV(await r.json()); setText(""); } else setErr(r ? await r.text() : "Network error. Try again.");
        }}>
          <label>{v.approval === "waiting" ? "Your reply" : "Anything you'd like to add? (optional)"}
            <textarea required rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", boxSizing: "border-box", font: "inherit", padding: 8 }} />
          </label>
          {text.length > 1500 && <small>{text.length}/2000</small>}
          {err && <p role="alert" style={{ color: "#b00020", margin: 0 }}>{err}</p>}
          <div><button className="btn btn-main" type="submit" disabled={busy || !text.trim()}>Send</button></div>
        </form>
      )}
    </div>
  );
}
