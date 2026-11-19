"use client";
import { useCallback, useEffect, useState } from "react";
import Notice from "@/components/notice";
import { PII_KINDS, REASONS } from "@/lib/pii-shared";

const call = async <T,>(body: unknown): Promise<T> => {
  const r = await fetch("/api/webmaster/pii", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (t: string) => new Date(t).toLocaleString();
const TABS = [["events", "Access events"], ["http", "HTTP log"], ["subject", "By subject"], ["flags", "Flags"], ["integrity", "Integrity & report"]] as const;
type Tab = (typeof TABS)[number][0];

// Who viewed whose personal information, and the checks around it. Reads lib/pii.ts through /api/webmaster/pii.
export default function Pii({ full }: { full: boolean }) {
  const [tab, setTab] = useState<Tab>("events"), [err, setErr] = useState("");
  const fail = (e: Error) => setErr(e.message);
  return <>
    <h1>Audit PII</h1>
    <p className="sub">Every time someone retrieved a member's or guest's personal information, with the reason they gave. The log can't be edited or deleted, and the board gets a monthly summary.</p>
    {err && <Notice kind="error">{err}</Notice>}
    <div className="bar" role="tablist">{TABS.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "pri" : ""} onClick={() => { setTab(t); setErr(""); }}>{l}</button>)}</div>
    {tab === "events" && <Events fail={fail} />}
    {tab === "http" && <Http fail={fail} />}
    {tab === "subject" && <Subject fail={fail} />}
    {tab === "flags" && <Flags fail={fail} />}
    {tab === "integrity" && <Integrity fail={fail} full={full} />}
  </>;
}

function Events({ fail }: { fail: (e: Error) => void }) {
  const [f, setF] = useState<Record<string, string | boolean>>({ self: false }), [rows, setRows] = useState<any[]>([]), [more, setMore] = useState(false);
  const load = useCallback((after?: number) => call<any[]>({ op: "events", f: { ...f, limit: 200, after } }).then((r) => { setRows((x) => (after ? [...x, ...r] : r)); setMore(r.length === 200); }, fail), [f]);
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); }, [load]);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const download = async () => { // the export is logged on the server
    const r = await fetch("/api/webmaster/pii", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "export", f }) });
    if (!r.ok) return fail(new Error(await r.text()));
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "pii-access.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  return <>
    <div className="bar">
      <input aria-label="Viewer" placeholder="Viewer email" value={String(f.viewer ?? "")} onChange={set("viewer")} />
      <input aria-label="Subject" placeholder="Person viewed" value={String(f.subject ?? "")} onChange={set("subject")} />
      <select aria-label="Kind" value={String(f.kind ?? "")} onChange={set("kind")}><option value="">Any kind</option>{Object.entries(PII_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Reason" value={String(f.reason ?? "")} onChange={set("reason")}><option value="">Any reason</option>{Object.entries(REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input aria-label="IP address" placeholder="IP" value={String(f.ip ?? "")} onChange={set("ip")} style={{ width: 120 }} />
      <label>From <input type="date" value={String(f.from ?? "")} onChange={set("from")} /></label><label>To <input type="date" value={String(f.to ?? "")} onChange={set("to")} /></label>
      <label><input type="checkbox" checked={f.self === true} onChange={(e) => setF({ ...f, self: e.target.checked })} /> include people viewing their own</label>
      <button onClick={download}>Export CSV</button>
    </div>
    <Table heads={["When", "Viewer", "Person", "Kind", "Reason", "Fields", "IP"]} rows={rows.map((r) => [when(r.at), <>{r.viewer_email}{r.viewer_is_admin && <span className="tag">admin</span>}</>, r.subject_name, PII_KINDS[r.kind as keyof typeof PII_KINDS] ?? r.kind,
      <>{r.via === "self" ? "own data" : REASONS[r.reason as keyof typeof REASONS] ?? r.reason}{r.note && <div className="sub" style={{ margin: 0 }}>“{r.note}”</div>}</>, (r.fields ?? []).join(", "), r.ip])} empty="No access recorded." />
    {more && <button onClick={() => load(rows[rows.length - 1].id)}>Older…</button>}
  </>;
}

function Http({ fail }: { fail: (e: Error) => void }) {
  const [rows, setRows] = useState<any[]>([]), [un, setUn] = useState(true);
  useEffect(() => { call<any[]>({ op: "http", unmatched: un }).then(setRows, fail); }, [un]);
  return <>
    <p className="sub">Successful requests to the routes that carry personal information, copied out of the HTTP log nightly. A request with <b>no access record</b> got data without going through the reason prompt: a possible bypass or leak.</p>
    <label><input type="checkbox" checked={un} onChange={(e) => setUn(e.target.checked)} /> Only requests with no access record</label>
    <Table heads={["When", "Request", "IP", "Who", "Browser", "Came from", "Access record"]} rows={rows.map((r) => [when(r.at), `${r.method} ${r.path}`, r.ip, r.user || "?", <small>{r.ua.slice(0, 60)}</small>, <small>{r.referer}</small>,
      r.access_id ? `#${r.access_id}` : <b style={{ color: "var(--bad)" }}>no access record</b>])} empty={un ? "Every request is explained by an access record." : "Nothing yet."} />
  </>;
}

function Subject({ fail }: { fail: (e: Error) => void }) {
  const [q, setQ] = useState(""), [found, setFound] = useState<any[]>([]), [sel, setSel] = useState<any>(null), [rows, setRows] = useState<any[]>([]);
  useEffect(() => { const t = setTimeout(() => call<any[]>({ op: "subjects", q }).then(setFound, fail), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (sel) call<any[]>({ op: "subject", type: sel.subject_type, id: sel.subject_id }).then(setRows, fail); }, [sel]);
  return <>
    <div className="bar"><input type="search" aria-label="Find a person" placeholder="Find a person who has been viewed" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 280 }} /></div>
    <div className="bar">{found.map((s) => <button key={s.subject_type + s.subject_id} className={sel?.subject_id === s.subject_id && sel?.subject_type === s.subject_type ? "pri" : ""} onClick={() => setSel(s)}>{s.name} ({s.views})</button>)}</div>
    {sel && <><h2>Everyone who has viewed {sel.name}</h2><Table heads={["When", "Viewer", "Kind", "Reason", "How"]} rows={rows.map((r) => [when(r.at), r.viewer_email, PII_KINDS[r.kind as keyof typeof PII_KINDS] ?? r.kind, r.via === "self" ? "own data" : <>{REASONS[r.reason as keyof typeof REASONS] ?? r.reason}{r.note && ` – ${r.note}`}</>, r.via])} empty="Nobody." /></>}
  </>;
}

function Flags({ fail }: { fail: (e: Error) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { call<any>({ op: "flags" }).then(setD, fail); }, []);
  if (!d) return <p className="sub">Loading…</p>;
  return <>
    <p className="sub">The last 30 days. These are prompts to look, not proof of anything.</p>
    <h2>Bulk viewing (more than {d.threshold} in an hour)</h2><Table heads={["Viewer", "Hour", "Views"]} rows={d.bulk.map((r: any) => [r.viewer_email, when(r.hour), r.n])} empty="None." />
    <h2>Off-hours (10pm to 6am)</h2><Table heads={["When", "Viewer", "Person", "Kind"]} rows={d.offHours.map((r: any) => [when(r.at), r.viewer_email, r.subject_name, r.kind])} empty="None." />
    <h2>From a new IP address</h2><Table heads={["When", "Viewer", "IP", "Person"]} rows={d.newIp.map((r: any) => [when(r.at), r.viewer_email, r.ip, r.subject_name])} empty="None." />
    <h2>Same person viewed 3+ times in a week</h2><Table heads={["Viewer", "Person", "Times", "Last"]} rows={d.repeat.map((r: any) => [r.viewer_email, r.subject_name, r.n, when(r.last)])} empty="None." />
    <h2>Viewed within a day of being given the permission</h2><Table heads={["When", "Viewer", "Person", "Kind"]} rows={d.justGranted.map((r: any) => [when(r.at), r.viewer_email, r.subject_name, r.kind])} empty="None." />
  </>;
}

function Integrity({ fail, full }: { fail: (e: Error) => void; full: boolean }) {
  const [d, setD] = useState<any>(null), [msg, setMsg] = useState(""), [prev, setPrev] = useState(""), [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const load = () => call<any>({ op: "integrity" }).then(setD, fail);
  useEffect(() => { load(); }, []);
  const save = (cfg: object) => call({ op: "saveCfg", cfg }).then(() => { setMsg("Saved."); load(); }, fail);
  if (!d) return <p className="sub">Loading…</p>;
  return <>
    <h2>Hash chain</h2>
    <p role="status" style={{ color: d.ok ? "var(--ok)" : "var(--bad)" }}>{d.ok ? `Intact: ${d.rows} rows checked.` : `BROKEN: row ${d.bad} doesn't match. Someone changed or removed rows.`}</p>
    <p className="sub">Latest hash (also in each monthly report; keep a copy elsewhere): <code>{d.head}</code></p>
    {msg && <Notice kind="success">{msg}</Notice>}
    {full && <section className="card" style={{ display: "grid", gap: 8, maxWidth: 560 }}>
      <h2 style={{ margin: 0 }}>Settings</h2>
      <label><input type="checkbox" checked={d.cfg.locked} onChange={(e) => save({ locked: e.target.checked })} /> <b>Lock PII retrieval</b>: nobody can retrieve anything (use if a leak is suspected)</label>
      <label>Alert when one person views more than <input type="number" min={1} max={1000} defaultValue={d.cfg.bulk} onBlur={(e) => Number(e.target.value) !== d.cfg.bulk && save({ bulk: Number(e.target.value) })} style={{ width: 70 }} /> records in an hour</label>
    </section>}
    <h2>Monthly report to the board</h2>
    <p className="sub">Sent on the last evening of the month to board@kzoomakers.org, only if something was viewed. It contains counts and names, never the information itself.</p>
    <div className="bar"><input type="month" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} /><button onClick={() => call<any>({ op: "preview", month }).then((r) => setPrev(r.html), fail)}>Preview</button>
      {full && <button onClick={() => call<any>({ op: "send", month }).then((r) => { setMsg(r.sent ? "Sent." : "Nothing to send."); load(); }, fail)}>Send now / resend</button>}</div>
    {prev && <div className="card" dangerouslySetInnerHTML={{ __html: prev }} />}
    <Table heads={["Month", "Result", "Rows", "Chain"]} rows={d.runs.map((r: any) => [r.month, r.skipped ? "skipped (no access)" : r.sent_at ? "sent " + when(r.sent_at) : "not sent", r.row_count, r.chain_ok ? "ok" : "BROKEN"])} empty="No report has run yet." />
  </>;
}

function Table({ heads, rows, empty }: { heads: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="sub">{empty}</p>;
  return <div style={{ overflowX: "auto" }}><table className="card" style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{heads.map((h) => <th key={h} align="left">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ verticalAlign: "top", padding: "4px 8px" }}>{c}</td>)}</tr>)}</tbody></table></div>;
}
