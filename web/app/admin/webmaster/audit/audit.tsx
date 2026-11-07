"use client";
import { useEffect, useState } from "react";
import { confirmDialog, alertDialog } from "@/components/dialog";
import { guidedDef, guidedLines } from "@/lib/guided";
import { ago } from "../ago";
import { seqDiff } from "../diff";
import DiffView from "../diff-view";

type Row = { id: number; at: string; actor: string; action: string; target: string };
type Detail =
  | { kind: "none" }
  | { kind: "page" | "data"; family?: string; before: any; after: any; revertable: boolean; why: string; newer: number; subject: string; undo?: "revert" | "restore" };

// Plain-English headline for an audit entry.
const VERB: Record<string, string> = { save: "Edited", revert: "Reverted", restore: "Restored", delete: "Deleted", import: "Initial version of", url: "Changed the link of", flush: "Flushed the cache of", create: "Created" };
const AREA: Record<string, string> = { page: "a page", menu: "the menu", board: "the board page", calendar: "the calendar", hours: "the hours", robots: "robots.txt" };
function headline(action: string) {
  const [area, second] = action.split(".");
  const verb = VERB[action.split(".").pop()!] ?? action;
  return `${verb} ${area === "guided" ? `the ${guidedDef(second)?.label ?? second} page` : AREA[area] ?? area}`;
}

const menuLines = (m: any[], d = 0): string[] => m.flatMap((i) => [`${"  ".repeat(d)}${i.label}${i.href ? ` → ${i.href}` : ""}`, ...(i.items ? menuLines(i.items, d + 1) : [])]);
function lines(family: string, d: any): string[] {
  if (family === "menu") return menuLines(d);
  if (family === "robots") return d.text.split("\n");
  if (family === "hours") return [`Open: ${d.schedule.openDays.join(", ")}`, `Time: ${d.schedule.openTime} - ${d.schedule.closeTime}`, `Closed message: ${d.schedule.closedMessage}`, `Closed today message: ${d.schedule.closedMessageToday}`, `Address: ${d.contact.address}`];
  if (family === "board") return [`Heading: ${d.title}`, `Intro: ${d.intro}`, ...d.members.map((m: any) => `${m.name} · ${m.role} · ${m.photo} · ${m.bio}`)];
  if (family === "calendar") return [`Calendar feed link: ${d.url}`];
  const def = guidedDef(family.slice(7));
  return def ? guidedLines(def.fields, d) : [JSON.stringify(d)];
}

function LineDiff({ family, before, after }: { family: string; before: any; after: any }) {
  const d = seqDiff(before ? lines(family, before) : [], lines(family, after)).filter((l) => l.t !== " ");
  if (!d.length) return <p className="sub">No visible changes.</p>;
  const n = (t: string) => d.filter((l) => l.t === t).length;
  return (
    <div className="diff">
      <div className="diffsum">{n("+") > 0 && <span className="chip c-added">{n("+")} added</span>} {n("-") > 0 && <span className="chip c-removed">{n("-")} removed</span>}</div>
      {d.map((l, j) => <div key={j} className={`dl d${l.t === "+" ? "a" : "r"}`}><span>{l.t}</span>{l.v}</div>)}
    </div>
  );
}

function Details({ r, onDone }: { r: Row; onDone: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/webmaster/audit?id=${r.id}`).then((x) => (x.ok ? x.json() : { kind: "none" })).then(setD).catch(() => setD({ kind: "none" })); }, [r.id]);
  if (!d) return <p className="sub">Loading…</p>;
  if (d.kind === "none")
    return <p className="sub">{headline(r.action)}{r.target ? ` (${r.target})` : ""}. Nothing on the site changed, so there is nothing to compare or revert.</p>;
  const revert = async () => {
    const what = d.undo === "restore" ? `${d.subject} will be put back, as it was before it was deleted.` : `${d.subject} will go back to how it was before this change.`;
    const more = d.newer ? `\n\n${d.newer} newer change${d.newer > 1 ? "s" : ""} to it will be undone as well.` : "";
    if (!(await confirmDialog(`Are you sure you want to revert this?\n\n${what}${more}\n\nThe revert is recorded here, so you can undo it again.`, { ok: "Yes, revert", danger: true }))) return;
    setBusy(true);
    const x = await fetch("/api/webmaster/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revert: r.id }) });
    setBusy(false);
    if (x.ok) onDone(); else await alertDialog(await x.text());
  };
  return (
    <div>
      {d.kind === "page" ? <DiffView before={d.before} after={d.after} /> : <LineDiff family={d.family!} before={d.before} after={d.after} />}
      <div className="bar">
        {d.revertable
          ? <button className="danger" disabled={busy} onClick={revert}>{d.undo === "restore" ? "↩ Restore this page" : "↩ Revert this change"}</button>
          : <span className="sub">Can't be reverted: {d.why}</span>}
      </div>
    </div>
  );
}

export default function Audit() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => fetch(`/api/webmaster/audit?q=${encodeURIComponent(q)}`).then((r) => r.json()).then(setRows).catch(() => setErr("Could not load the log")), 200);
    return () => clearTimeout(t);
  }, [q, n]);
  return (
    <>
      <h1>Audit log</h1>
      <p className="sub">Who changed what, newest first. Open “Changes” to see exactly what was different, and revert it if you need to. Search by person, action (e.g. page.delete) or target.</p>
      <div className="bar"><input placeholder="Search…" aria-label="Search audit log" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <p className="err">{err}</p>}
      <div className="card">
        {rows.map((r) => (
          <div key={r.id}>
            <div className="row">
              <span className="grow"><b>{headline(r.action)}</b> {r.target} <span className="tag" title={r.action}>by {r.actor}</span></span>
              <span className="tag" title={new Date(r.at).toLocaleString()}>{ago(r.at)}</span>
              <button aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide changes" : "Changes"}</button>
            </div>
            {open === r.id && <div style={{ padding: "0 0 12px" }}><Details r={r} onDone={() => { setOpen(null); setN(n + 1); }} /></div>}
          </div>
        ))}
        {!rows.length && <p className="sub">No entries.</p>}
      </div>
    </>
  );
}
