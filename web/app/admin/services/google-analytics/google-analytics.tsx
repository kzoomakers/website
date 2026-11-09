"use client";
import { useEffect, useState } from "react";
import Notice from "@/components/notice";
import type { adminView } from "@/lib/ga";

type View = Awaited<ReturnType<typeof adminView>>;
type Person = { name: string; kind: string; owner: string };
type Overview = { digest: { on: boolean; emails: string[]; last: string }; people: Person[]; subs: Person[] };
const rpc = async (body: Record<string, unknown>) => {
  const r = await fetch("/api/webmaster/ga", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

export default function GoogleAnalytics({ initial, canEdit }: { initial: View; canEdit: boolean }) {
  const [v, setV] = useState(initial), [msg, setMsg] = useState(""), [bad, setBad] = useState(false), [busy, setBusy] = useState(false);
  const [on, setOn] = useState(initial.enabled), [banner, setBanner] = useState(initial.banner), [mid, setMid] = useState(initial.measurementId), [pid, setPid] = useState(initial.propertyId), [site, setSite] = useState(initial.searchConsoleSite), [key, setKey] = useState("");
  const [nt, setNt] = useState<Overview | null>(null), [pick, setPick] = useState(""), [dOn, setDOn] = useState(false), [dMail, setDMail] = useState("");
  const load = (o: Overview) => { setNt(o); setDOn(o.digest.on); setDMail(o.digest.emails.join("\n")); };
  useEffect(() => { if (canEdit) rpc({ op: "overview" }).then(load).catch(() => {}); }, [canEdit]);
  const run = async (fn: () => Promise<string>) => { setBusy(true); setMsg(""); setBad(false); try { setMsg(await fn()); } catch (e: any) { setBad(true); setMsg(e.message); } setBusy(false); };
  const save = (credentials = key) => run(async () => { const n = await rpc({ op: "save", enabled: on, banner, measurementId: mid, propertyId: pid, searchConsoleSite: site, credentials }); setV(n); setKey(""); return "Saved."; });
  return (
    <div style={{ maxWidth: 820 }}>
      <h1>Analytics &amp; cookie notice</h1>
      <p className="sub">Optional. When on, the public site is counted by Google Analytics and staff get an <a href="/admin/webmaster/analytics">Analytics</a> page under Website with visitors, pages, sources (including AI assistants) and countries. Reports are fetched from Google at most once an hour.</p>
      {msg && <Notice kind={bad ? "error" : "success"}>{msg}</Notice>}
      <section className="card" style={{ padding: 14, marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={banner} disabled={!canEdit} onChange={(e) => setBanner(e.target.checked)} /> <strong>Ask visitors to accept cookies</strong></label>
        <p className="sub" style={{ margin: "6px 0" }}>Shows the cookie notice on public pages. Google Analytics, Heap and PostHog start only after a visitor clicks Accept. <strong>If you turn this off, nobody is asked and those trackers start for everyone</strong>, so only do that if you have another way of getting consent (or no visitors who need it).</p>
      </section>
      <section className="card" style={{ padding: 14, marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => setOn(e.target.checked)} /> <strong>Turn on Google Analytics</strong></label>
        <p className="sub" style={{ margin: "6px 0" }}>Adds the tracking tag to public pages (never admin pages) and turns on the report. The privacy page adds a paragraph automatically while this is on.</p>
      </section>
      <section className="card" style={{ padding: 14, marginBottom: 12 }}>
        <strong>1. Tracking tag</strong>
        <p className="sub" style={{ margin: "6px 0" }}>Measurement ID: GA4 Admin &gt; Data streams &gt; your web stream.</p>
        <input aria-label="Measurement ID" placeholder="G-XXXXXXXXXX" value={mid} disabled={!canEdit} onChange={(e) => setMid(e.target.value)} />
      </section>
      <section className="card" style={{ padding: 14, marginBottom: 12 }}>
        <strong>2. Reports</strong>
        <ol className="sub" style={{ margin: "6px 0", paddingLeft: 20 }}>
          <li>In Google Cloud, enable the <em>Google Analytics Data API</em> and create a service account with a JSON key.</li>
          <li>In GA4 Admin &gt; Property access management, add the service account's email with the <em>Viewer</em> role.</li>
          <li>Paste the Property ID (GA4 Admin &gt; Property details, a number) and the whole JSON key below.</li>
        </ol>
        <input aria-label="Property ID" placeholder="Property ID, e.g. 123456789" inputMode="numeric" value={pid} disabled={!canEdit} onChange={(e) => setPid(e.target.value)} style={{ marginBottom: 8 }} />
        <textarea aria-label="Service-account key (JSON)" rows={4} autoComplete="off" disabled={!canEdit} placeholder={v.serviceAccount ? "Paste a new key to replace the saved one" : '{ "type": "service_account", … }'} value={key} onChange={(e) => setKey(e.target.value)} style={{ width: "100%", boxSizing: "border-box", font: "13px/1.4 ui-monospace,monospace" }} />
        <p className="sub" style={{ margin: "6px 0" }}>{v.serviceAccount ? <>✓ Key saved for <strong>{v.serviceAccount}</strong>. It is stored encrypted and never shown again.</> : "No key saved yet."}</p>
      </section>
      <section className="card" style={{ padding: 14, marginBottom: 12 }}>
        <strong>3. Search Console (optional)</strong>
        <p className="sub" style={{ margin: "6px 0" }}>Shows the searches that found the site. Enable the <em>Google Search Console API</em> in the same Google Cloud project, then in <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Search Console</a> &gt; Settings &gt; Users and permissions, add the service account's email (Restricted is enough). If permission is missing, the Analytics page simply leaves this section out.</p>
        <input aria-label="Search Console site" placeholder="sc-domain:example.org  or  https://example.org/" value={site} disabled={!canEdit} onChange={(e) => setSite(e.target.value)} />
      </section>
      {canEdit && nt && (
        <section className="card" style={{ padding: 14, marginBottom: 12 }}>
          <strong>4. Alerts and weekly email</strong>
          <p className="sub" style={{ margin: "6px 0" }}><strong>Alerts:</strong> when a day has twice the usual visitors, or less than 40% of them, a push goes to the topic <code>google-analytics-notices</code>. Attach a person's topic to receive it.</p>
          {nt.subs.map((p) => <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>{p.owner || p.name}</span><button disabled={busy} onClick={() => run(async () => { load(await rpc({ op: "unsubscribe", topic: p.name })); return "Removed."; })}>Remove</button></div>)}
          {!nt.subs.length && <p className="sub">Nobody is attached yet.</p>}
          <div style={{ display: "flex", gap: 8, margin: "6px 0 14px" }}>
            <select aria-label="Person" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Add a person…</option>{nt.people.filter((p) => !nt.subs.some((s) => s.name === p.name)).map((p) => <option key={p.name} value={p.name}>{p.owner || p.name}{p.kind === "extra" ? ` (${p.name})` : ""}</option>)}</select>
            <button disabled={busy || !pick} onClick={() => run(async () => { load(await rpc({ op: "subscribe", topic: pick })); setPick(""); return "Added."; })}>Add</button>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={dOn} onChange={(e) => setDOn(e.target.checked)} /> <strong>Send a weekly email summary</strong></label>
          <p className="sub" style={{ margin: "6px 0" }}>Mondays from 8am Eastern: visitors, top pages and sources, AI visits and popular searches for the last 7 days. One address per line.</p>
          <textarea aria-label="Weekly email addresses" rows={3} value={dMail} onChange={(e) => setDMail(e.target.value)} placeholder="name@example.org" style={{ width: "100%", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={busy} onClick={() => run(async () => { load(await rpc({ op: "digest", on: dOn, emails: dMail })); return "Saved."; })}>Save weekly email</button>
            <button disabled={busy || !nt.digest.emails.length} onClick={() => run(async () => { await rpc({ op: "digest-now" }); return "Sent to the saved addresses."; })}>Send it now</button>
          </div>
        </section>
      )}
      {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="pri" disabled={busy} onClick={() => save()}>{busy ? "Working…" : "Save"}</button>
          <button disabled={busy || !v.serviceAccount || !v.propertyId} onClick={() => run(async () => { await rpc({ op: "test" }); return "Connected: Google Analytics answered."; })}>Test connection</button>
          {v.serviceAccount && <button className="danger" disabled={busy} onClick={() => save("-")}>Remove key</button>}
        </div>
      )}
    </div>
  );
}
