"use client";
import Notice from "@/components/notice";
import { useState } from "react";
import { tours } from "../rpc";

type Person = { name: string; kind: string; owner: string };
type Data = { cfg: { emails: Record<string, string[]>; staleDays: number }; subs: Record<string, Person[]>; people: Person[]; events: Record<string, string> };
const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const chip = { display: "inline-flex", gap: 6, alignItems: "center", background: "var(--acc-bg)", color: "var(--acc)", borderRadius: 999, padding: "2px 4px 2px 10px", margin: "2px 6px 2px 0", fontSize: 13 } as const;
const xbtn = { border: 0, background: "none", color: "inherit", cursor: "pointer", fontSize: 14, padding: "0 6px" } as const;
const label = (p: Person) => `${p.owner || p.name}${p.kind === "extra" ? ` (${p.name})` : ""}`;

// Who hears about tour events, by email (type an address, press Enter) and by ntfy push (pick a person's topic). Each notification has its own lists.
export default function Notifications({ initial }: { initial: Data }) {
  const [d, setD] = useState(initial), [msg, setMsg] = useState(""), [draft, setDraft] = useState<Record<string, string>>({}), [pick, setPick] = useState<Record<string, string>>({}), [days, setDays] = useState(String(initial.cfg.staleDays));
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

      <h2>Push notifications (ntfy)</h2>
      <p className="sub">Pick people and their own ntfy topic gets these messages, so they arrive in the ntfy app they already use. You can pick anyone's topic, including the extra topics they have made.</p>
      {events.map(([ev, name]) => {
        const have = new Set(d.subs[ev].map((s) => s.name)), free = d.people.filter((p) => !have.has(p.name));
        return (
          <div className="card" key={ev} style={{ marginBottom: 12, padding: 14 }}>
            <strong>{name}</strong>
            <div style={{ margin: "8px 0" }}>
              {d.subs[ev].map((s) => <span key={s.name} style={chip}>{label(s)}<button type="button" style={xbtn} aria-label={`Remove ${label(s)}`} onClick={() => run(() => tours("subRemove", { event: ev, topic: s.name }))}>✕</button></span>)}
              {!d.subs[ev].length && <span className="sub" style={{ margin: 0 }}>No one yet.</span>}
            </div>
            <div className="bar" style={{ marginBottom: 0 }}>
              <select value={pick[ev] ?? ""} onChange={(e) => setPick({ ...pick, [ev]: e.target.value })} aria-label={`Add a person for: ${name}`}>
                <option value="">Choose a person…</option>
                {free.map((p) => <option key={p.name} value={p.name}>{label(p)}</option>)}
              </select>
              <button disabled={!pick[ev]} onClick={() => { const t = pick[ev]; setPick({ ...pick, [ev]: "" }); run(() => tours("subAdd", { event: ev, topic: t })); }}>Add</button>
            </div>
          </div>
        );
      })}

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
