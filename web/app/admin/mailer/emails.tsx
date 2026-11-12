"use client";
import Notice from "@/components/notice";
import { confirmDialog, promptDialog } from "@/components/dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rpc, when, pct, type Camp, type State } from "./api";
import { fill, renderEmail } from "@/lib/mail-render";

const TABS = [["all", "All"], ["draft", "Draft"], ["scheduled", "Scheduled"], ["sending", "Sending"], ["sent", "Sent"], ["trash", "Trash"]] as const;

export function Emails({ s }: { s: State; reload: () => void }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ rows: any[]; counts: Record<string, number>; limitHit?: boolean } | null>(null);
  const [modal, setModal] = useState<{ kind: "preview"; html: string; title: string } | { kind: "stats"; st: any } | null>(null);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const load = useCallback(() => rpc("emails", { status, search }).then(setData).catch((e) => setMsg(e.message)), [status, search]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  // Counters move while something is sending.
  useEffect(() => { if (!data?.counts.sending) return; const t = setInterval(load, 4000); return () => clearInterval(t); }, [data, load]);
  const act = async (id: number, action: string) => { try { const r = await rpc("campaignAction", { id, action }); if (action === "duplicate") router.push("/admin/mailer/email/" + r.id); else load(); } catch (e: any) { setMsg(e.message); } };
  const listNames = (ids: number[]) => ids.map((i) => s.lists.find((l) => l.id === i)?.name).filter(Boolean).join(", ");
  return (
    <>
      <h1>Emails <Link href="/admin/mailer/email/new"><button className="pri">New email</button></Link></h1>
      <div className="mp-tabs">{TABS.map(([k, label]) => <button key={k} aria-current={status === k ? "true" : undefined} onClick={() => setStatus(k)}>{label} <small>({data?.counts[k] ?? 0})</small></button>)}</div>
      <p><input type="search" placeholder="Search emails" aria-label="Search emails" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} /></p>
      {data?.limitHit && <Notice kind="info">Today's email limit has been reached. Emails that are still sending will carry on after midnight (Detroit time).</Notice>}
      {msg && <Notice kind="error">{msg}</Notice>}
      <table className="mp-table">
        <thead><tr><th>Subject</th><th>Status</th><th>Lists</th><th>Opened</th><th>Clicked</th><th>Updated</th></tr></thead>
        <tbody>
          {data?.rows.map((c) => (
            <tr key={c.id}>
              <td><b>{c.subject || <i className="mut">(no subject)</i>}</b><br /><small>{c.name}</small>
                <div className="mp-act">
                  {status === "trash" ? <><button onClick={() => act(c.id, "restore")}>Restore</button><button className="bad" onClick={async () => (await confirmDialog("Delete this email permanently? You won't be able to get it back.", { ok: "Delete email", danger: true })) && act(c.id, "delete")}>Delete permanently</button></> : <>
                    {c.status === "draft" && <Link href={"/admin/mailer/email/" + c.id}>Edit</Link>}
                    {c.status === "scheduled" && <button onClick={() => act(c.id, "unschedule")}>Unschedule to edit</button>}
                    {(c.status === "sent" || c.status === "sending") && <button onClick={async () => setModal({ kind: "stats", st: await rpc("stats", { id: c.id }) })}>Statistics</button>}
                    <button onClick={async () => { const full: Camp = await rpc("campaign", { id: c.id }); setModal({ kind: "preview", title: c.subject || c.name, html: fill(renderEmail(full.design, location.origin, full.preview), { name: "Alex", unsubscribe: "#" }) }); }}>Preview</button>
                    <button onClick={() => act(c.id, "duplicate")}>Duplicate</button>
                    <button className="bad" disabled={c.status === "sending"} onClick={() => act(c.id, "trash")}>Move to trash</button></>}
                </div></td>
              <td>{c.status === "sending" ? <span className="pill sending">Sending {c.sent + c.failed}/{c.total}</span> : c.status === "sent" ? <><span className="pill sent">Sent</span><br /><small>{when(c.sent_at)}</small></> : c.status === "scheduled" ? <><span className="pill">Scheduled</span><br /><small>{when(c.scheduled_at)}</small></> : <span className="pill draft">Draft</span>}</td>
              <td><small>{listNames(c.list_ids)}</small></td>
              <td>{c.sent ? pct(c.opened, c.sent) : "–"}</td><td>{c.sent ? pct(c.clicked, c.sent) : "–"}</td>
              <td><small>{when(c.updated_at)}</small></td>
            </tr>))}
        </tbody>
      </table>
      {data && !data.rows.length && <p className="sub">{status === "all" && !search ? "No emails yet. Click “New email” to start from a template." : "Nothing here."}</p>}
      {modal && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: modal.kind === "preview" ? 680 : 800, maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            {modal.kind === "preview" ? <><h2>{modal.title}</h2><iframe title="Preview" sandbox="" srcDoc={modal.html} style={{ width: "100%", height: "65vh", border: "1px solid var(--line)" }} /></> : (
              <>
                <h2>{modal.st.campaign?.subject || modal.st.campaign?.name}</h2>
                <table className="mp-table"><tbody>
                  <tr><td>Delivered</td><td><b>{modal.st.sent}</b>{modal.st.failed > 0 && <small> ({modal.st.failed} failed)</small>}</td></tr>
                  <tr><td>Opened</td><td><b>{pct(modal.st.opened, modal.st.sent)}</b> <small>({modal.st.opened})</small></td></tr>
                  <tr><td>Clicked</td><td><b>{pct(modal.st.clicked, modal.st.sent)}</b> <small>({modal.st.clicked})</small></td></tr>
                  <tr><td>Unsubscribed</td><td><b>{pct(modal.st.unsubscribed, modal.st.sent)}</b> <small>({modal.st.unsubscribed})</small></td></tr>
                </tbody></table>
                {modal.st.links.length > 0 && <><h3>Links clicked</h3>{modal.st.links.map((l: any) => <div key={l.url} className="row"><span className="grow" title={l.url}>{l.url}</span><b>{l.clicks}</b></div>)}</>}
                <Recipients id={modal.st.campaign.id} />
                <p className="sub">Opens are counted when the email's tiny tracking image loads, so mail apps that block images or pre-load them make this approximate.</p>
              </>)}
            <div className="bar" style={{ marginTop: 12 }}><button onClick={() => setModal(null)}>Close</button></div>
          </div>
        </div>)}
    </>
  );
}

const FILTERS = [["", "Everyone"], ["opened", "Opened"], ["clicked", "Clicked"], ["unopened", "Didn't open"]] as const;

/** Per-person results for one email: who opened it (how many times), and which links they clicked. */
function Recipients({ id }: { id: number }) {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { setRows(null); rpc("recipients", { id, filter }).then(setRows).catch(() => setRows([])); }, [id, filter]);
  return (
    <>
      <h3>Recipients</h3>
      <div className="mp-tabs">{FILTERS.map(([k, label]) => <button key={k} aria-current={filter === k ? "true" : undefined} onClick={() => setFilter(k)}>{label}</button>)}</div>
      <div style={{ maxHeight: 280, overflow: "auto" }}>
        <table className="mp-table">
          <thead><tr><th>Person</th><th>Opened</th><th>Clicked</th></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.email}>
                <td>{r.email}{r.name && <><br /><small>{r.name}</small></>}{r.status === "failed" && <><br /><small className="err">delivery failed</small></>}</td>
                <td>{r.opened_at ? <>✓ <small>{when(r.opened_at)}{r.opens > 1 ? ` · ${r.opens} times` : ""}</small></> : <span className="mut">–</span>}</td>
                <td>{r.clicks ? <small>{r.urls?.join(", ")}</small> : <span className="mut">–</span>}</td>
              </tr>))}
          </tbody>
        </table>
        {rows && !rows.length && <p className="sub">Nobody here yet.</p>}
      </div>
    </>
  );
}

/** Step 1 of a new email: pick a template; the draft is created right away like MailPoet does. */
export function NewEmail({ s }: { s: State }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const use = async (t: State["templates"][number]) => {
    try { const r = await rpc("saveCampaign", { campaign: { name: t.name === "Blank" ? "Untitled email" : t.name, design: t.design } }); router.push("/admin/mailer/email/" + r.id); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <div>
      <h1>Pick a template</h1>
      <p className="sub">You can change everything afterwards. Your own templates (saved from the editor) are listed with these.</p>
      <p><Link href="/admin/mailer/emails">← Back to emails</Link> {msg && <span className="err">{msg}</span>}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 14 }}>
        {s.templates.map((t) => (
          <div className="card" style={{ padding: 8 }} key={t.id}>
            <iframe title={t.name} sandbox="" scrolling="no" srcDoc={renderEmail(t.design, location.origin)} style={{ width: "100%", height: 260, border: 0, pointerEvents: "none" }} />
            <div className="bar" style={{ margin: "6px 0 0" }}><b style={{ flex: 1 }}>{t.name}</b>
              {t.id > 0 && <button className="danger" onClick={async () => { if (await confirmDialog("Delete this template? Emails already made from it are not affected.", { ok: "Delete template", danger: true })) { await rpc("deleteTemplate", { id: t.id }); router.refresh(); } }}>Delete</button>}
              <button className="pri" onClick={() => use(t)}>Select</button></div>
          </div>))}
      </div>
    </div>
  );
}

/** Step 3 (after the editor): subject, recipients, sender, and when to send. */
export function SendStep({ id, s }: { id: number; s: State }) {
  const router = useRouter();
  const [c, setC] = useState<Camp | null>(null);
  const [msg, setMsg] = useState("");
  const [when_, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc("campaign", { id }).then(setC).catch((e) => setMsg(e.message)); }, [id]);
  const reach = useMemo(() => (c ? s.lists.filter((l) => c.list_ids.includes(l.id)).reduce((n, l) => n + l.subscribed, 0) : 0), [c, s.lists]);
  if (!c) return <p>{msg || "Loading…"}</p>;
  if (c.status !== "draft") return <p>This email has already been sent or scheduled. <Link href="/admin/mailer/emails">Back to emails</Link></p>;
  const settings = { id, subject: c.subject, preview: c.preview, list_ids: c.list_ids, tags: c.tags ?? [], sender_name: c.sender_name ?? "", sender_address: c.sender_address ?? "", reply_to: c.reply_to ?? "" };
  const go = async (fn: () => Promise<unknown>) => { setBusy(true); setMsg(""); try { await fn(); } catch (e: any) { setMsg(e.message); } setBusy(false); };
  const set = (p: Partial<Camp>) => setC({ ...c, ...p });
  return (
    <div className="mp-step">
      <h1>Final step: subject, recipients and sending</h1>
      <p><Link href={"/admin/mailer/email/" + id}>← Back to the editor</Link></p>
      <div className="card" style={{ padding: 18 }} >
        <div className="mp">
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="field"><span>Subject</span><input value={c.subject} placeholder="e.g. Spring open house this Saturday" onChange={(e) => set({ subject: e.target.value })} /></label>
            <label className="field"><span>Preview text (shown after the subject in inboxes)</span><input value={c.preview} onChange={(e) => set({ preview: e.target.value })} /></label>
            <div className="field"><span>Send to</span>
              {s.lists.map((l) => <label className="in" key={l.id}><input type="checkbox" checked={c.list_ids.includes(l.id)} onChange={(e) => set({ list_ids: e.target.checked ? [...c.list_ids, l.id] : c.list_ids.filter((x) => x !== l.id) })} />{l.name} <small>({l.subscribed})</small></label>)}
              <br /><small>About {reach} people will get this (fewer if they are on more than one list{c.tags?.length ? " or don't have the tags below" : ""}).</small></div>
            <label className="field"><span>Only people tagged (optional, comma-separated)</span><input list="mp-tags" value={(c.tags ?? []).join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((x) => x.trim()) })} />
              <datalist id="mp-tags">{s.tags.map((t) => <option key={t} value={t} />)}</datalist></label>
            <div className="field"><span>Sender</span>
              <input style={{ width: "40%" }} placeholder={s.cfg.fromName || "Sender name"} value={c.sender_name ?? ""} onChange={(e) => set({ sender_name: e.target.value })} />{" "}
              <input style={{ width: "50%" }} placeholder={s.cfg.from || "sender@example.org"} value={c.sender_address ?? ""} onChange={(e) => set({ sender_address: e.target.value })} />
              <br /><small>Leave blank to use the defaults from Settings.</small></div>
            <label className="field"><span>Reply-to address</span><input placeholder={s.cfg.replyTo || "same as sender"} value={c.reply_to ?? ""} onChange={(e) => set({ reply_to: e.target.value })} /></label>
            <div className="field"><span>When</span>
              <label className="in"><input type="radio" checked={when_ === "now"} onChange={() => setWhen("now")} />Send now</label>
              <label className="in"><input type="radio" checked={when_ === "later"} onChange={() => setWhen("later")} />Schedule</label>
              {when_ === "later" && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ width: "auto" }} />}</div>
          </div>
        </div>
        {msg && <Notice kind="error">{msg}</Notice>}
        <div className="bar">
          <button disabled={busy} onClick={() => go(async () => { await rpc("saveCampaign", { campaign: settings }); setMsg("Saved."); })}>Save as draft</button>
          <button disabled={busy} onClick={() => go(async () => { const to = await promptDialog("Send a test to which address?"); if (!to) return; await rpc("saveCampaign", { campaign: settings }); await rpc("test", { id, to }); setMsg("Test sent to " + to); })}>Send test</button>
          <button className="pri" disabled={busy} onClick={() => go(async () => {
            if (when_ === "later" && !at) throw new Error("Pick a date and time");
            if (when_ === "now" && !(await confirmDialog(`"${c.subject}" goes out immediately to about ${reach} people and can't be recalled.`, { title: `Send to about ${reach} people?`, ok: `Send to ${reach}`, cancelLabel: "Not yet", danger: true }))) return;
            await rpc("saveCampaign", { campaign: settings });
            await rpc("send", { id, at: when_ === "later" ? new Date(at).toISOString() : undefined });
            router.push("/admin/mailer/emails");
          })}>{when_ === "later" ? "Schedule" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}
