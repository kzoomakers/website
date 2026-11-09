"use client";
import { useState } from "react";
import { useDirtyGuard } from "@/components/dirty-guard";
import Notice, { msgKind } from "@/components/notice";
import Revisions from "../../webmaster/revisions";
import { CSP_MODES, FRAMES, KEYS, REFERRERS, headersFor, type Exception, type SecHeaders } from "@/lib/sechead";

const LABEL: Record<string, string> = { hsts: "HSTS", nosniff: "No-sniff", frame: "Framing", referrer: "Referrer", permissions: "Permissions", csp: "CSP" };

export default function SecurityEditor({ initial }: { initial: SecHeaders }) {
  const [c, setC] = useState(initial), [msg, setMsg] = useState(""), [saved, setSaved] = useState(0), [clean, setClean] = useState(0), [probe, setProbe] = useState("/");
  const set = (p: Partial<SecHeaders>) => { setMsg(""); setC({ ...c, ...p }); };
  const setEx = (i: number, p: Partial<Exception>) => set({ exceptions: c.exceptions.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const save = async () => {
    const r = await fetch("/api/webmaster/security-headers", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
    if (r.ok) { setC(await r.json()); setClean(clean + 1); setMsg("Saved. Every server picks it up within 30 seconds."); } else setMsg(await r.text());
    setSaved(saved + 1);
  };
  useDirtyGuard(c, clean);
  const shown = headersFor(c, probe, true);
  return (
    <>
      <h1>Security headers</h1>
      <p className="sub">Sent with every page and file. They tell browsers to refuse framing, content sniffing and unexpected scripts. Start the policy in <b>report-only</b>, watch the browser console for "Content Security Policy" warnings, then switch to <b>enforce</b>. Every change is recorded and can be reverted below.</p>
      {msg && <Notice kind={msgKind(msg)}>{msg}</Notice>}
      <div className="card" style={{ padding: 12, display: "grid", gap: 12 }}>
        <label><input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> <b>Send security headers</b> (master switch)</label>

        <details open><summary><b>Strict-Transport-Security (HSTS)</b></summary>
          <label><input type="checkbox" checked={c.hsts.on} onChange={(e) => set({ hsts: { ...c.hsts, on: e.target.checked } })} /> On (HTTPS requests only)</label>{" "}
          <label>max-age seconds <input type="number" min={0} max={63072000} value={c.hsts.maxAge} onChange={(e) => set({ hsts: { ...c.hsts, maxAge: Number(e.target.value) } })} /></label>{" "}
          <label><input type="checkbox" checked={c.hsts.subdomains} onChange={(e) => set({ hsts: { ...c.hsts, subdomains: e.target.checked } })} /> includeSubDomains</label>{" "}
          <label><input type="checkbox" checked={c.hsts.preload} onChange={(e) => set({ hsts: { ...c.hsts, preload: e.target.checked } })} /> preload</label>
          <p className="sub">Browsers remember this for max-age. Turn on includeSubDomains only if every kzoomakers.org subdomain (wiki, files, cameras…) has HTTPS; preload is close to permanent.</p>
        </details>

        <label><input type="checkbox" checked={c.nosniff} onChange={(e) => set({ nosniff: e.target.checked })} /> <code>X-Content-Type-Options: nosniff</code></label>
        <label>Framing (<code>X-Frame-Options</code>) <select value={c.frame} onChange={(e) => set({ frame: e.target.value as SecHeaders["frame"] })}>{FRAMES.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>Referrer-Policy <select value={c.referrer} onChange={(e) => set({ referrer: e.target.value as SecHeaders["referrer"] })}>{REFERRERS.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>Permissions-Policy <input style={{ width: "100%" }} value={c.permissions} onChange={(e) => set({ permissions: e.target.value })} /></label>

        <details open><summary><b>Content-Security-Policy</b></summary>
          <label>Mode <select value={c.csp.mode} onChange={(e) => set({ csp: { ...c.csp, mode: e.target.value as SecHeaders["csp"]["mode"] } })}>{CSP_MODES.map((f) => <option key={f}>{f}</option>)}</select></label>
          <textarea style={{ width: "100%", fontFamily: "monospace", marginTop: 6 }} rows={13} aria-label="CSP directives, one per line" value={c.csp.directives} onChange={(e) => set({ csp: { ...c.csp, directives: e.target.value } })} />
          <p className="sub">One directive per line; lines starting with # are ignored. <code>frame-ancestors</code> here also controls who may frame the site.</p>
        </details>

        <details open><summary><b>Exceptions</b></summary>
          <p className="sub">Paths that skip some headers. <code>/embed/*</code> covers that folder and everything below; <code>/page</code> matches only that page. Use these for a page that must be framed elsewhere, or a path with its own policy.</p>
          {c.exceptions.map((e, i) => (
            <div key={i} className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <input aria-label="Path" placeholder="/path/*" value={e.path} onChange={(x) => setEx(i, { path: x.target.value })} />
              {KEYS.map((k) => <label key={k}><input type="checkbox" checked={e.skip.includes(k)} onChange={(x) => setEx(i, { skip: x.target.checked ? [...e.skip, k] : e.skip.filter((s) => s !== k) })} /> skip {LABEL[k]}</label>)}
              <input aria-label="Note" placeholder="Why (optional)" value={e.note ?? ""} onChange={(x) => setEx(i, { note: x.target.value })} />
              <button onClick={() => set({ exceptions: c.exceptions.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <div className="bar"><button onClick={() => set({ exceptions: [...c.exceptions, { path: "/", skip: [] }] })}>Add exception</button></div>
        </details>

        <details open style={{ position: "sticky", bottom: 0, background: "var(--card, Canvas)", borderTop: "1px solid", padding: "6px 0" }}><summary><b>Preview</b></summary>
          <label>Headers sent for this path <input value={probe} onChange={(e) => setProbe(e.target.value)} /></label>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: "30vh", overflow: "auto" }}>{Object.entries(shown).map(([k, v]) => `${k}: ${v}`).join("\n") || "(none)"}</pre>
        </details>

        <div className="bar"><button className="pri" onClick={save}>Save</button></div>
      </div>
      <Revisions<SecHeaders> api="/api/webmaster/security-headers" reload={saved} lines={(d) => [`enabled: ${d.enabled}`, `hsts: ${JSON.stringify(d.hsts)}`, `nosniff: ${d.nosniff}`, `frame: ${d.frame}`, `referrer: ${d.referrer}`, `permissions: ${d.permissions}`, `csp mode: ${d.csp.mode}`, ...d.csp.directives.split("\n"), ...d.exceptions.map((e) => `exception ${e.path}: skip ${e.skip.join(",")}`)]}
        onRevert={async (r) => { setC(await r.json()); setClean(clean + 1); setMsg("Reverted."); }} />
    </>
  );
}
