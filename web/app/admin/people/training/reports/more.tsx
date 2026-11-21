"use client";
import { useEffect, useState } from "react";
import { alertDialog, confirmDialog } from "@/components/dialog";
import { training } from "../rpc";

const HOWS: Record<string, string> = { waive_test: "Waive the test", skip_training: "Skip training, go to sign-off", certify_now: "Certify now", credit_prior: "Credit a prior certification", revoke: "Revoke", void_attempt: "Void a test attempt", reset_attempts: "Reset attempts (let them retake)" };
const REPORTS: Record<string, string> = { overrides: "Overrides (for the board)", pipeline: "Pipeline", coverage: "Tool coverage", questions: "Question analytics", trainers: "Trainer activity", rollouts: "Re-pass rollouts", audit: "Audit log (training)" };

function Override() {
  const [q, setQ] = useState(""), [found, setFound] = useState<{ id: number; name: string; email: string }[]>([]), [who, setWho] = useState<{ id: number; name: string } | null>(null);
  const [tools, setTools] = useState<{ id: number; name: string }[]>([]), [tool, setTool] = useState(0), [how, setHow] = useState("waive_test"), [why, setWhy] = useState(""), [date, setDate] = useState(""), [attempt, setAttempt] = useState("");
  useEffect(() => { training("reportTools").then(setTools, () => {}); }, []);
  useEffect(() => { if (q.trim().length < 2 || who) { setFound([]); return; } const t = setTimeout(() => training("findMembers", { q }).then(setFound, () => {}), 250); return () => clearTimeout(t); }, [q, who]);
  const go = async () => {
    if (!(await confirmDialog(`${HOWS[how]}${who ? ` for ${who.name}` : ""}? This is recorded, and the leads and the member are told.`, { ok: "Do it", danger: true } as any))) return;
    training("override", { how, user: who?.id, tool, reason: why, date: date || undefined, attempt: attempt ? Number(attempt) : undefined }).then(() => { alertDialog("Done. It's in the overrides report."); setWhy(""); }, (e) => alertDialog(e.message));
  };
  return (
    <div className="card" style={{ padding: 16 }}>
      <p className="sub" style={{ marginTop: 0 }}>For when the normal steps don't fit. Always needs a reason, is shown as an override in the member's file, and you can't use it on yourself.</p>
      <label>Action <select value={how} onChange={(e) => setHow(e.target.value)}>{Object.entries(HOWS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {how === "void_attempt" ? <label>Attempt number <input value={attempt} onChange={(e) => setAttempt(e.target.value)} /></label> : <>
        <label>Member {who ? <b>{who.name} <button onClick={() => setWho(null)}>Change</button></b> : <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />}</label>
        {found.map((m) => <div key={m.id}><button onClick={() => { setWho(m); setQ(""); }}>{m.name} ({m.email})</button></div>)}
        <label>Tool <select value={tool} onChange={(e) => setTool(Number(e.target.value))}><option value={0}>Choose…</option>{tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      </>}
      {how === "credit_prior" && <label>Date they were certified <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
      <label>Reason (and evidence, for a prior certification) <textarea rows={3} style={{ width: "100%" }} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
      <div className="bar"><button className="pri" onClick={go}>Apply override…</button></div>
    </div>
  );
}

function Report({ name }: { name: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  useEffect(() => { training("report", { name }).then(setRows, (e) => alertDialog(e.message)); }, [name]);
  const csv = async () => { const r = await fetch("/api/webmaster/training", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "reportCsv", name }) }); if (!r.ok) return alertDialog(await r.text()); const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = `training-${name}.csv`; a.click(); URL.revokeObjectURL(a.href); };
  if (!rows) return <p className="sub">Loading…</p>;
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <div className="card" style={{ padding: 8, overflowX: "auto" }}>
      {!rows.length ? <p className="sub">Nothing yet.</p> : <table><thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: "left", padding: "2px 8px" }}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} style={{ padding: "2px 8px" }}>{c === "at" ? new Date(String(r[c])).toLocaleString("en-US", { timeZone: "America/Detroit" }) : String(r[c] ?? "")}</td>)}</tr>)}</tbody></table>}
      {rows.length > 0 && <div className="bar"><button onClick={csv}>Download CSV</button></div>}
    </div>
  );
}

export default function More({ canOverride }: { canOverride: boolean }) {
  const [open, setOpen] = useState("overrides");
  return (
    <>
      {canOverride && <><h2>Override</h2><Override /></>}
      <h2>Reports</h2>
      <div className="bar">{Object.entries(REPORTS).map(([k, v]) => <button key={k} className={open === k ? "pri" : ""} onClick={() => setOpen(k)}>{v}</button>)}</div>
      <Report key={open} name={open} />
    </>
  );
}
