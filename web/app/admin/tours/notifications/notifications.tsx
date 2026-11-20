"use client";
import Notice from "@/components/notice";
import { useState } from "react";
import { tours } from "../rpc";

type Data = { pause: { paused: boolean; message: string }; cfg: { emails: Record<string, string[]>; staleDays: number }; events: Record<string, string> };
const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const chip = { display: "inline-flex", gap: 6, alignItems: "center", background: "var(--acc-bg)", color: "var(--acc)", borderRadius: 999, padding: "2px 4px 2px 10px", margin: "2px 6px 2px 0", fontSize: 13 } as const;
const xbtn = { border: 0, background: "none", color: "inherit", cursor: "pointer", fontSize: 14, padding: "0 6px" } as const;

// Who hears about tour events, by email (type an address, press Enter). Push alerts go through Pushover (see Alert delivery).
export default function Notifications({ initial }: { initial: Data }) {
  const [d, setD] = useState(initial), [msg, setMsg] = useState(""), [draft, setDraft] = useState<Record<string, string>>({}), [days, setDays] = useState(String(initial.cfg.staleDays)), [paused, setPaused] = useState(initial.pause.paused), [pmsg, setPmsg] = useState(initial.pause.message);
  const reload = async () => setD(await tours("notifyGet"));
  const run = async (fn: () => Promise<unknown>) => { setMsg(""); try { await fn(); await reload(); } catch (e: any) { setMsg(e.message); } };
  const addEmail = (ev: string) => {
    const v = (draft[ev] ?? "").trim().toLowerCase();
    if (!v) return;
    if (!EMAIL_OK.test(v)) return setMsg(`"${v}" doesn't look like an email address.`);
    setDraft({ ...draft, [ev]: "" });
    run(() => tours("emailAdd", { event: ev, email: v }));
  };
  const events = Object.entries(d.events);
  return (
    <>
      <h1>Tour alerts</h1>
      <p className="sub">Choose who is told when things happen. A guide is always emailed about bookings on their own times; these lists add to that. Changes save as you make them.</p>
      {msg && <Notice kind="error">{msg}</Notice>}

      <h2>Signups</h2>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <label><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> <strong>Pause signups</strong></label>
        <p className="sub" style={{ margin: "8px 0" }}>While paused, no one can book a time. They can still leave their details and join the walk-up queue. This message shows on the homepage and on the tours page.</p>
        <textarea rows={3} value={pmsg} onChange={(e) => setPmsg(e.target.value)} maxLength={600} aria-label="Message shown while signups are paused" style={{ width: "100%", maxWidth: 560 }} />
        <p style={{ margin: "8px 0 0" }}><button onClick={() => run(() => tours("pauseSave", { paused, message: pmsg }))}>Save</button> <span className="sub">{d.pause.paused ? "Signups are paused right now." : "Signups are open."}</span></p>
      </div>

      <h2>Email</h2>
      {events.map(([ev, name]) => (
        <div className="card" key={ev} style={{ marginBottom: 12, padding: 14 }}>
          <strong>{name}</strong>
          <div style={{ margin: "8px 0" }}>
            {d.cfg.emails[ev].map((m) => <span key={m} style={chip}>{m}<button type="button" style={xbtn} aria-label={`Remove ${m}`} onClick={() => run(() => tours("emailRemove", { event: ev, email: m }))}>✕</button></span>)}
            {!d.cfg.emails[ev].length && <span className="sub" style={{ margin: 0 }}>No one yet.</span>}
          </div>
          <input type="email" placeholder="Add an email and press Enter" aria-label={`Add an email for: ${name}`} value={draft[ev] ?? ""} onChange={(e) => setDraft({ ...draft, [ev]: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(ev); } }} style={{ width: "100%", maxWidth: 420 }} />
        </div>
      ))}

      <h2>Push notifications</h2>
      <p className="sub">Push alerts for each of these go to a Pushover delivery group. Set the groups, and who is in them, in <a href="/admin/system/pushover">Alert delivery</a>.</p>

      <h2>Untaken walk-ups</h2>
      <div className="card" style={{ padding: 14 }}>
        <label>Tell the lists above when a walk-up request has gone untaken for{" "}
          <input type="number" min={0} max={90} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 70 }} /> days</label>{" "}
        <button onClick={() => run(() => tours("staleSave", { days: Number(days) }))}>Save</button>
        <p className="sub" style={{ margin: "8px 0 0" }}>0 turns this off. Repeats every this-many days while any are still untaken, as one summary that gets grimmer the bigger the pile. Checked every 30 minutes.</p>
      </div>
    </>
  );
}
