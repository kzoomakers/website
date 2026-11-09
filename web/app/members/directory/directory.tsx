"use client";
import { useEffect, useRef, useState } from "react";
import "./directory.css";
import type { Listing } from "@/lib/crm";
import { FIELDS, SOCIALS, isFacet, socialHref, type Fields } from "@/lib/fields";

const LABEL: Record<string, string> = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.label]));
const api = (body: unknown) => fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const LEVEL: Record<string, string> = { learning: "learning", competent: "knows it", teach: "teaches" };
const join = (...p: (string | undefined)[]) => p.filter(Boolean).join(" · ");

// Search members who chose to be listed. Compact cards, photo on the left. Messages go to their in-app inbox; an address shows only if that member chose to list it.
export default function Directory({ initial, listed, facets }: { initial: Listing[]; listed: boolean; facets: { fields: Fields; skills: boolean } }) {
  const [rows, setRows] = useState(initial), [q, setQ] = useState(""), [level, setLevel] = useState(""), [filters, setFilters] = useState<Record<string, string>>({}), first = useRef(true);
  const [sent, setSent] = useState<number | null>(null), [to, setTo] = useState<Listing | null>(null), [body, setBody] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => { const r = await api({ op: "search", q, level, filters }).catch(() => null); if (r?.ok) setRows(await r.json()); }, 250);
    return () => clearTimeout(t);
  }, [q, level, filters]);
  const active = !!q || !!level || Object.values(filters).some(Boolean);
  const f = (m: Listing, k: string) => m.fields[k]?.join(", ");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!listed && <p role="status" style={{ background: "#fff4d6", color: "#4a3500", padding: "10px 14px", borderRadius: 8, margin: 0 }}>You're not in the directory. <a href="/members/profile">Set up your profile</a> to appear here and to message other members.</p>}
      <div className="dr-bar">
        <input type="search" aria-label="Search" placeholder="Search a name, skill, interest, job, company or place" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 280px" }} />
        {facets.skills && <select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Any level</option><option value="help">Can help (knows it or teaches)</option><option value="teach">Can teach</option></select>}
        {Object.keys(FIELDS).filter((k) => isFacet(k) && facets.fields[k]).map((k) => (
          <select key={k} aria-label={LABEL[k]} value={filters[k] ?? ""} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}><option value="">Any {LABEL[k].toLowerCase()}</option>{facets.fields[k].map((v) => <option key={v}>{v}</option>)}</select>
        ))}
        {active && <button type="button" className="btn btn-sm" onClick={() => { setQ(""); setLevel(""); setFilters({}); }}>Clear</button>}
        <small className="dr-line" aria-live="polite">{rows.length} member{rows.length === 1 ? "" : "s"}{rows.length === 60 ? "+ (showing 60, narrow the search)" : ""}</small>
      </div>
      {msg && <p role="status" style={{ margin: 0 }}>{msg}</p>}
      <div className="dr-grid">
        {rows.map((m) => (
          <article key={m.id} className="dr-card">
            {m.photo ? <img className="dr-pic" src={m.photo} alt={m.name} loading="lazy" /> : <span className="dr-pic" aria-hidden>{m.name[0]}</span>}
            <div className="dr-main">
              <div className="dr-name">{m.name}{f(m, "pronouns") && <small className="dr-pro"> {f(m, "pronouns")}</small>}</div>
              {(f(m, "occupation") || f(m, "company")) && <div className="dr-line"><b>{join(f(m, "occupation"), f(m, "company"))}</b></div>}
              {(f(m, "industry") || f(m, "neighborhood") || f(m, "city")) && <div className="dr-line">{join(f(m, "industry"), join(f(m, "neighborhood"), f(m, "city")).replace(" · ", ", "))}</div>}
              {m.since && <div className="dr-line">Member since {new Date(m.since).toLocaleDateString([], { month: "short", year: "numeric" })}</div>}
              {f(m, "working_on") && <div className="dr-line">🔨 <b>Working on:</b> {f(m, "working_on")}</div>}
              {f(m, "looking_for") && <div className="dr-line">🔎 <b>Looking for:</b> {f(m, "looking_for")}</div>}
              {m.bio && <><p className={"dr-bio" + (open === m.id ? " open" : "")} id={"bio-" + m.id}>{m.bio}</p>{m.bio.length > 140 && <button type="button" className="link" aria-expanded={open === m.id} aria-controls={"bio-" + m.id} onClick={() => setOpen(open === m.id ? null : m.id)} style={{ border: 0, background: "none", color: "var(--acc)", padding: 0 }}>{open === m.id ? "Show less" : "Read more"}</button>}</>}
              {(m.skills.length > 0 || m.fields.interests || m.fields.machine || m.fields.open_to) && <div className="dr-chips">
                {m.fields.open_to?.map((v) => <span key={v} className="dr-chip open" title="Open to">🤝 {v}</span>)}
                {m.fields.machine?.map((v) => <span key={v} className="dr-chip mach" title="Favorite machine or area">🛠️ {v}</span>)}
                {m.skills.map((s) => <span key={s.name} className={"dr-chip" + (s.level === "teach" ? " teach" : "")} title={s.note || undefined}>{s.name} <small>{LEVEL[s.level]}</small></span>)}
                {m.fields.interests?.map((v) => <span key={v} className="dr-chip int">{v}</span>)}
              </div>}
              <div className="dr-foot">
                {m.phone && <a href={`tel:${m.phone}`}>{m.phone}</a>}{m.email && <a href={`mailto:${m.email}`}>{m.email}</a>}{m.discord && <span>Discord: {m.discord}</span>}
                {(Object.keys(SOCIALS) as (keyof typeof SOCIALS)[]).filter((k) => m.socials?.[k]).map((k) => <a key={k} href={socialHref(k, m.socials[k])} target="_blank" rel="noopener noreferrer nofollow">{SOCIALS[k].label}</a>)}
                {sent === m.id && to?.id !== m.id && <span role="status" className="sub">Sent. Replies appear in your <a href="/members/inbox">Inbox</a>.</span>}
                {to?.id !== m.id && <button className="btn btn-sm" onClick={() => { setTo(m); setSent(null); setMsg(""); }}>{sent === m.id ? "Send another" : `Message ${m.name.split(" ")[0]}`}</button>}
              </div>
            </div>
            {to?.id === m.id && (
              <form className="dr-msg" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await api({ op: "message", to: m.id, body }).catch(() => null); setBusy(false); if (r?.ok) { setMsg(""); setSent(m.id); setTo(null); setBody(""); } else setMsg(r ? await r.text() : "Network error."); }}>
                <textarea required minLength={5} maxLength={2000} rows={3} aria-label={`Message to ${m.name}`} placeholder="Say what you're working on and what you'd like help with. They'll get it in their inbox here and by email." value={body} onChange={(e) => setBody(e.target.value)} />
                <div style={{ display: "flex", gap: 8 }}><button className="btn btn-main btn-sm" disabled={busy}>Send</button><button type="button" className="btn btn-sm" onClick={() => setTo(null)}>Cancel</button></div>
              </form>
            )}
          </article>
        ))}
      </div>
      {!rows.length && <p>No one matches{active ? " — try clearing a filter" : " yet"}.</p>}
    </div>
  );
}
