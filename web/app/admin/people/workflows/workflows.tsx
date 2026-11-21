"use client";
import { useState } from "react";
import { alertDialog } from "@/components/dialog";

type F = { classes: boolean; tests: boolean };
const WAYS: [string, (f: F) => string][] = [
  ["Classes and online tests", (f) => (f.classes && f.tests ? "now" : "")],
  ["Classes only", (f) => (f.classes && !f.tests ? "now" : "")],
  ["Online tests only", (f) => (!f.classes && f.tests ? "now" : "")],
  ["Neither (staff grant authorizations by hand)", (f) => (!f.classes && !f.tests ? "now" : "")],
];

export default function Workflows({ initial }: { initial: F }) {
  const [f, setF] = useState(initial), [busy, setBusy] = useState(false);
  const set = (k: keyof F, v: boolean) => {
    setBusy(true);
    fetch("/api/webmaster/features", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ [k]: v }) })
      .then(async (r) => { if (!r.ok) throw new Error(await r.text()); setF(await r.json()); }).catch((e) => alertDialog(e.message)).finally(() => setBusy(false));
  };
  return (
    <>
      <h1>Workflows</h1>
      <p className="sub">Choose how members get authorized on tools. Each switch hides that workflow from the members menu, the home page and the Tool authorizations page, and pauses its reminders and announcements. Switching one off never removes anyone's authorization, registration or history.</p>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ marginBottom: 12 }}><label><input type="checkbox" checked={f.classes} disabled={busy} onChange={(e) => set("classes", e.target.checked)} /> <b>Classes</b></label><div className="sub" style={{ margin: "4px 0 0" }}>Member class list, sign-ups and proposals, the class announcement email, and classes shown on each tool.</div></div>
        <div style={{ marginBottom: 12 }}><label><input type="checkbox" checked={f.tests} disabled={busy} onChange={(e) => set("tests", e.target.checked)} /> <b>Online tests and trainer sign-off</b></label><div className="sub" style={{ margin: "4px 0 0" }}>Members take the test, then a trainer signs them off. Starting tests, re-pass reminders and lapse checks. Trainers can still work through anyone already in the queue. Email wording is under Training settings.</div></div>
        <p style={{ margin: 0 }} className="sub">Always on: tool authorizations. Staff can grant, waive or credit them from the member's page whatever is chosen here.</p>
      </div>
      <h2>Your space right now</h2>
      <ul>{WAYS.map(([l, on]) => <li key={l} style={on(f) ? { fontWeight: 700 } : { opacity: 0.55 }}>{l}{on(f) ? " ← current" : ""}</li>)}</ul>
    </>
  );
}
