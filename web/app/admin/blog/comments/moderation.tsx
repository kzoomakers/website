"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { AdminComment, Settings, Status } from "@/lib/comments";

const TABS: [Status, string][] = [["pending", "Pending"], ["approved", "Approved"], ["spam", "Spam"], ["hidden", "Hidden"]];
const api = (method: string, body?: unknown, q = "") => fetch("/api/webmaster/comments" + q, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export default function Moderation({ initial, tab: t0, counts: n0, settings: s0 }: { initial: AdminComment[]; tab: Status; counts: Record<string, number>; settings: Settings }) {
  const [tab, setTab] = useState(t0), [items, setItems] = useState(initial), [n, setN] = useState(n0), [s, setS] = useState(s0), [note, setNote] = useState("");
  const load = async (st: Status) => { setTab(st); const r = await (await fetch(`/api/webmaster/comments?status=${st}`)).json(); setItems(r.comments); setN(r.counts); };
  const move = async (c: AdminComment, status: Status) => {
    const r = await api("PATCH", { id: c.id, status });
    if (!r.ok) return setNote(await r.text());
    setItems(items.filter((x) => x.id !== c.id));
    setN({ ...n, [c.status]: (n[c.status] ?? 1) - 1, [status]: (n[status] ?? 0) + 1 });
  };
  const del = async (c: AdminComment) => {
    if (!(await confirmDialog("Delete this comment and all replies under it for good?", { ok: "Delete", danger: true }))) return;
    await api("DELETE", undefined, `?id=${c.id}`);
    load(tab);
  };
  const empty = async () => {
    if (!(await confirmDialog("Permanently delete everything in Spam?", { ok: "Empty spam", danger: true }))) return;
    await api("DELETE", undefined, "?spam=1"); setItems([]); setN({ ...n, spam: 0 });
  };
  const save = async () => { const r = await api("PATCH", { settings: s }); setNote(r.ok ? "Settings saved." : await r.text()); if (r.ok) setS(await r.json()); };

  return (
    <>
      <h1>Comments</h1>
      <p className="sub">Readers reply to each other in threads. New comments pass the spam filter first; anything it isn't sure about waits here.</p>
      <nav className="bar" aria-label="Comment status">
        {TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => load(k)} style={tab === k ? { fontWeight: 700 } : undefined}>{l} ({n[k] ?? 0})</button>)}
        {tab === "spam" && items.length > 0 && <button className="danger" onClick={empty}>Empty spam</button>}
      </nav>
      <div className="card">
        {items.map((c) => (
          <div key={c.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div><strong>{c.name}</strong> <span className="tag">{c.email}</span> <span className="tag">on <a href={`/blog/${c.post_slug}#c${c.id}`} target="_blank">{c.post_title}</a></span>
              {c.parent_name && <span className="tag">reply to {c.parent_name}</span>} <span className="tag">{new Date(c.created_at).toLocaleString()}</span>
              {c.reason && <span className="tag" title="Why the filter held or flagged it">{c.reason}</span>}</div>
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{c.body}</p>
            {tab !== "approved" && <button onClick={() => move(c, "approved")}>Approve</button>}{" "}
            {tab !== "spam" && <button onClick={() => move(c, "spam")}>Spam</button>}{" "}
            {tab !== "hidden" && <button onClick={() => move(c, "hidden")}>Hide</button>}{" "}
            <button className="danger" onClick={() => del(c)}>Delete</button>
          </div>
        ))}
        {!items.length && <p className="sub">Nothing in {tab}.</p>}
      </div>
      <h2 style={{ marginTop: 32 }}>Moderation settings</h2>
      <div className="card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <label>Who needs approval
          <select value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value as Settings["mode"] })}>
            <option value="first_time">First-time commenters only</option>
            <option value="all">Every comment</option>
            <option value="none">Nobody (the spam filter still runs)</option>
          </select></label>
        <label>Close comments after (days, 0 = never)
          <input type="number" min={0} max={3650} value={s.closeAfterDays} onChange={(e) => setS({ ...s, closeAfterDays: Number(e.target.value) })} /></label>
        <label>Blocked words (one per line; a match goes straight to Spam)
          <textarea rows={3} value={s.blocked} onChange={(e) => setS({ ...s, blocked: e.target.value })} /></label>
        <label><input type="checkbox" checked={s.notify} onChange={(e) => setS({ ...s, notify: e.target.checked })} /> Email the post's author and the person being replied to</label>
        <div><button onClick={save}>Save settings</button> {note && <span className="sub" role="status">{note}</span>}</div>
      </div>
    </>
  );
}
