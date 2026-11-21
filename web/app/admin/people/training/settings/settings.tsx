"use client";
import { useState } from "react";
import { alertDialog } from "@/components/dialog";
import { EVENTS, render, VARS } from "@/lib/training/copy";
import type { TrainingCfg } from "@/lib/training/settings";
import { training } from "../rpc";
import Discord from "./discord";

const SAMPLE = { name: "Sam", tool: "Table saw", deadline: "Dec 15", trainer: "Pat", reason: "the lockout steps changed", days: "3 days", link: "https://example.org/members/training" };

type Health = { jobs: { job: string; label: string; at: string | null; ok: boolean; error: string }[]; queues: { label: string; n: number }[] };

export default function Settings({ cfg, canEdit, discord, health }: { cfg: TrainingCfg; canEdit: boolean; discord: React.ComponentProps<typeof Discord>["init"] | null; health: Health }) {
  const [on, setOn] = useState(cfg.enabled), [events, setEvents] = useState(cfg.events), [copy, setCopy] = useState(cfg.copy), [reply, setReply] = useState(cfg.reply_to), [days, setDays] = useState(cfg.reminder_days.join(", ")), [open, setOpen] = useState("");
  const save = () => training("saveCfg", { cfg: { events, copy, reply_to: reply, reminder_days: days.split(/[ ,]+/).filter(Boolean).map(Number) } }).then(() => alertDialog("Saved."), (x) => alertDialog(x.message));
  return (
    <>
      <h1>Training settings</h1>
      <p className="sub">Training is off until you switch it on. Switching it off hides the member Training page and stops training emails; it never removes anyone's tool authorization.</p>
      <div className="card" style={{ padding: 16 }}>
        <label><input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => { const v = e.target.checked; training("setEnabled", { enabled: v }).then(() => setOn(v), (x) => alertDialog(x.message)); }} /> Training is on</label>
      </div>
      <h2>Background jobs</h2>
      <p className="sub">When each job last ran on any server. Staff get a Pushover alert if the deadline sweep stops for 3 hours. A job that hasn't run since a restart shows "not yet".</p>
      <div className="card">
        {health.jobs.map((j) => <div className="row" key={j.job}><span style={{ flex: 1 }}>{j.label}</span><span className={j.ok ? "sub" : "tag"} style={{ margin: 0 }}>{j.at ? new Date(j.at).toLocaleString() : "not yet"}{!j.ok && ` failed: ${j.error}`}</span></div>)}
        {health.queues.map((x) => <div className="row" key={x.label}><span style={{ flex: 1 }}>{x.label}</span><b>{x.n}</b></div>)}
      </div>
      <h2>Emails and notices</h2>
      <p className="sub">Each one goes out as an email and a bell notice. Edit the wording; use {Object.keys(VARS).map((k) => `{{${k}}}`).join(" ")}. Plain text only; blank lines start a new paragraph.</p>
      <div className="card">{Object.entries(EVENTS).map(([k, ev]) => {
        const cur = copy[k] ?? { subject: ev.subject, body: ev.body }, pv = render(cur, SAMPLE);
        return (
          <div className="row" key={k} style={{ display: "block" }}>
            <label><input type="checkbox" disabled={!canEdit} checked={events[k] !== false} onChange={(e) => setEvents({ ...events, [k]: e.target.checked })} /> <b>{ev.label}</b></label> <span className="tag">{ev.to === "lead" ? "to leads" : "to the member"}</span>
            <button onClick={() => setOpen(open === k ? "" : k)}>{open === k ? "Close" : "Edit wording"}</button>
            {open === k && (
              <div>
                <input aria-label="Subject" style={{ width: "100%" }} disabled={!canEdit} value={cur.subject} onChange={(e) => setCopy({ ...copy, [k]: { ...cur, subject: e.target.value } })} />
                <textarea aria-label="Body" rows={6} style={{ width: "100%" }} disabled={!canEdit} value={cur.body} onChange={(e) => setCopy({ ...copy, [k]: { ...cur, body: e.target.value } })} />
                {canEdit && copy[k] && <button onClick={() => { const { [k]: _, ...rest } = copy; setCopy(rest); }}>Reset to the default</button>}
                <p className="sub" style={{ margin: "6px 0 0" }}>Preview: <b>{pv.subject}</b></p><pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{pv.text}</pre>
              </div>
            )}
          </div>
        );
      })}</div>
      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <label>Replies go to (blank: the site's reply address) <input type="email" disabled={!canEdit} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
        <label>Re-pass reminders, days before the deadline <input disabled={!canEdit} value={days} onChange={(e) => setDays(e.target.value)} /></label>
        {canEdit && <div className="bar"><button className="pri" onClick={save}>Save</button></div>}
      </div>
      {discord && canEdit && <Discord init={discord} />}
    </>
  );
}
