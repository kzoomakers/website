"use client";
import Notice from "@/components/notice";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DisableButton from "../disable-button";
import { confirmDialog } from "@/components/dialog";

import { pagesOf, SECTIONS, SECTION_LABEL, type Level, type Perms, type Section } from "@/lib/access";

type Row = { id: number; email: string; name: string; perms: Perms; founder: boolean; disabled: boolean };
const pagesFor = (s: Section) => pagesOf(s).filter((p) => !p.full); // the pages that can be given one at a time
const LEVEL: Record<Level, string> = { read: "View only", write: "Can edit" };

/** What this person can open, in a few words: "Website (edit), Tours: Walk-ups, Availability (view)". */
const summary = (perms: Perms) => SECTIONS.flatMap((s) => {
  const whole = perms[s], some = pagesFor(s).filter((p) => perms[`${s}:${p.key}`]);
  return whole ? [`${SECTION_LABEL[s]} (${whole === "write" ? "edit" : "view"})`] : some.length ? [`${SECTION_LABEL[s]}: ${some.map((p) => `${p.label} (${perms[`${s}:${p.key}`] === "write" ? "edit" : "view"})`).join(", ")}`] : [];
});

// Two lists, as in a role picker: what they could be given on the left, what they have on the right. Add a whole section to keep it simple, or open one and add single pages.
function Editor({ u, locked, set }: { u: Row; locked: boolean; set: (key: string, level: Level | null) => void }) {
  const has = (k: string) => u.perms[k];
  const addable = SECTIONS.filter((s) => !has(s)), granted = SECTIONS.filter((s) => has(s) || pagesFor(s).some((p) => has(`${s}:${p.key}`)));
  const add = { padding: "2px 10px" } as const, item = { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: "1px solid var(--line)" } as const;
  const level = (k: string, label: string) => (
    <select aria-label={`${u.name}: ${label}`} disabled={locked} value={has(k)} onChange={(e) => set(k, e.target.value as Level)}>{(Object.keys(LEVEL) as Level[]).map((l) => <option key={l} value={l}>{LEVEL[l]}</option>)}</select>
  );
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", padding: "8px 0 14px" }}>
      <div><h3 style={{ margin: "0 0 6px" }}>Could add</h3>
        {addable.map((s) => (
          <details key={s} open={granted.includes(s)} style={{ marginBottom: 6 }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>{SECTION_LABEL[s]}</summary>
            <div style={item}><span style={{ flex: 1 }}><b>Everything in {SECTION_LABEL[s]}</b>{s === "admin" && <small className="sub"> (can edit = full administrator)</small>}</span><button type="button" style={add} disabled={locked} aria-label={`Give ${u.name} everything in ${SECTION_LABEL[s]}`} onClick={() => set(s, "read")}>＋</button></div>
            {pagesFor(s).length > 1 && pagesFor(s).filter((p) => !has(`${s}:${p.key}`)).map((p) => (
              <div key={p.key} style={item}><span style={{ flex: 1 }}>{p.label}</span><button type="button" style={add} disabled={locked} aria-label={`Give ${u.name} ${p.label} in ${SECTION_LABEL[s]}`} onClick={() => set(`${s}:${p.key}`, "read")}>＋</button></div>
            ))}
          </details>
        ))}
        {!addable.length && <p className="sub">They have every section.</p>}
      </div>
      <div><h3 style={{ margin: "0 0 6px" }}>Has access to</h3>
        {granted.map((s) => (
          <details key={s} open style={{ marginBottom: 6 }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>{SECTION_LABEL[s]}</summary>
            {has(s) ? (
              <div style={item}><span style={{ flex: 1 }}><b>Everything in {SECTION_LABEL[s]}</b></span>{level(s, `everything in ${SECTION_LABEL[s]}`)}<button type="button" style={add} disabled={locked} aria-label={`Take away ${SECTION_LABEL[s]} from ${u.name}`} onClick={() => set(s, null)}>−</button></div>
            ) : pagesFor(s).filter((p) => has(`${s}:${p.key}`)).map((p) => (
              <div key={p.key} style={item}><span style={{ flex: 1 }}>{p.label}</span>{level(`${s}:${p.key}`, p.label)}<button type="button" style={add} disabled={locked} aria-label={`Take away ${p.label} from ${u.name}`} onClick={() => set(`${s}:${p.key}`, null)}>−</button></div>
            ))}
          </details>
        ))}
        {!granted.length && <p className="sub">No access yet. Add a section on the left.</p>}
      </div>
    </div>
  );
}

// Who can open each admin page: none, view only, or view + change, for a whole section or one page at a time. Search finds ordinary site accounts to grant access to.
export default function Users({ initial, canEdit }: { initial: Row[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial), [q, setQ] = useState(""), [err, setErr] = useState(""), [editing, setEditing] = useState(0), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => fetch("/api/webmaster/users?q=" + encodeURIComponent(q)).then((r) => (r.ok ? r.json() : Promise.reject())).then(setRows, () => setErr("Search failed.")), 250);
    return () => clearTimeout(t);
  }, [q]);
  // `key` is a section ("tours") or one page of it ("tours:walkups"); the server drops a section's single pages when the whole section is given.
  const set = async (u: Row, key: string, level: Level | null) => {
    setErr("");
    const r = await fetch("/api/webmaster/users", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id, section: key, level }) });
    if (!r.ok) return setErr(await r.text());
    setRows((rs) => rs.map((x) => {
      if (x.id !== u.id) return x;
      const perms = { ...x.perms };
      if (!key.includes(":") && level) for (const k of Object.keys(perms)) if (k.startsWith(key + ":")) delete perms[k];
      if (level) perms[key] = level; else delete perms[key];
      return { ...x, perms };
    }));
  };
  const del = async (u: Row) => {
    if (!(await confirmDialog(`Are you sure you want to delete ${u.name} (${u.email})?\n\nThis permanently removes their account, profile, photo ID, comments, emergency contacts and access. Their signed waiver PDFs are kept for the record. This cannot be undone.`, { ok: "Delete account", danger: true }))) return;
    setErr("");
    const r = await fetch(`/api/webmaster/users/${u.id}`, { method: "DELETE" });
    if (!r.ok) return setErr(await r.text());
    setRows((rs) => rs.filter((x) => x.id !== u.id));
  };
  return (
    <>
        <h1>Access</h1>
        <p className="sub">Click a name to open them in CRM. Click <strong>Edit access</strong> to choose what someone can open: add a whole section to keep it simple (everything in Tours), or add single pages to be precise (just Walk-ups). <strong>View only</strong> lets someone look but not change; <strong>Can edit</strong> lets them change things. System + Can edit is a full administrator who can also grant access. Anyone who has registered on the site can be found below; the first person to register is made the founding administrator, whose access can never be changed. At least 3 administrators must always remain.</p>
        <div className="bar"><input type="search" aria-label="Search people" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 280 }} /></div>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={{ textAlign: "left", padding: "10px 8px" }}>Person</th><th style={{ textAlign: "left", padding: "10px 8px" }}>Can open</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <Fragment key={u.id}>
                  <tr style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                    <td style={{ padding: "8px" }}><div style={{ fontWeight: 600 }}><Link href={`/admin/crm/people/${u.id}`} title="Open in CRM">{u.name}</Link>{u.disabled && <span className="tag" style={{ color: "var(--bad)" }}>Disabled</span>}{u.founder && <span className="tag" title="The first person to register. Their access can never be changed.">Founder</span>}</div><div className="sub" style={{ fontSize: 13 }}>{u.email}</div></td>
                    <td style={{ padding: "8px" }}>{summary(u.perms).map((t) => <div key={t} className="sub" style={{ fontSize: 13 }}>{t}</div>)}{!summary(u.perms).length && <span className="sub">No access</span>}</td>
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      <button type="button" aria-expanded={editing === u.id} onClick={() => setEditing(editing === u.id ? 0 : u.id)}>{editing === u.id ? "Done" : canEdit && !u.founder ? "Edit access" : "See access"}</button>
                      {canEdit && !u.founder && <DisableButton id={u.id} name={u.name} disabled={u.disabled} onChange={(d) => setRows((rs) => rs.map((x) => (x.id === u.id ? { ...x, disabled: d } : x)))} />}{canEdit && !u.founder && <button type="button" onClick={() => del(u)} style={{ marginLeft: 6, color: "var(--bad)" }}>Delete</button>}
                    </td>
                  </tr>
                  {editing === u.id && <tr><td colSpan={3} style={{ padding: "0 8px", background: "var(--bg)" }}><Editor u={u} locked={!canEdit || u.founder} set={(k, l) => set(u, k, l)} /></td></tr>}
                </Fragment>
              ))}
              {!rows.length && <tr><td colSpan={3} className="sub" style={{ padding: 16 }}>No one found.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 16 }}>Some administrators are set up outside this list; they always have full access and don't appear here. You can't change your own Admin access.</p>
    </>
  );
}
