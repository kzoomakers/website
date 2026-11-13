"use client";
import Notice, { msgKind } from "@/components/notice";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pct, rpc, when, type Cfg, type State } from "./api";
import Editor from "./editor";
import { Emails, NewEmail, SendStep } from "./emails";
import Subscribers from "./subscribers";
import Tracking from "./tracking";
import Forms from "./forms";
import { alertDialog, confirmDialog } from "@/components/dialog";

export type Props = { s: State; reload: () => void };

export default function MailAdmin({ slug }: { slug: string[] }) {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const reload = useCallback(() => rpc<State>("state").then(setS).catch((e) => setErr(e.message)), []);
  useEffect(() => { reload(); }, [reload]);
  if (!s) return <p>{err || "Loading…"}</p>;
  const [a, b, c] = slug;
  // The editor and the send step use the whole window, like MailPoet's.
  if (a === "email") {
    if (b === "new") return <NewEmail s={s} />;
    const id = Number(b);
    return c === "send" ? <SendStep id={id} s={s} /> : <Editor id={id} state={s} />;
  }
  return (
    <div className="mp">
      <div style={{ minWidth: 0 }}>
        {!s.cfg.mail && a !== "settings" && <p className="sub" role="status">⚠️ Sending isn't set up yet — it needs both a sender address and an SMTP2GO key (or SMTP server). Add them under <Link href="/admin/mailer/settings">Settings</Link>. You can still build lists and drafts.</p>}
        {!a && <Home s={s} />}
        {a === "emails" && <Emails s={s} reload={reload} />}
        {a === "forms" && <Forms s={s} reload={reload} />}
        {a === "subscribers" && <Subscribers s={s} reload={reload} />}
        {a === "queue" && <Queue />}
        {a === "lists" && <Lists s={s} reload={reload} />}
        {a === "settings" && <Settings s={s} reload={reload} />}
        {a === "tracking" && <Tracking id={b ? Number(b) : undefined} />}
      </div>
    </div>
  );
}

function Home({ s }: { s: State }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { rpc("dashboard").then(setD).catch(() => {}); }, []);
  if (!d) return <p>Loading…</p>;
  const stat = (n: number, label: string, href = "") => <Link href={"/admin/mailer/subscribers" + href} className="card" style={{ padding: 14, minWidth: 130, textAlign: "center" }}><b style={{ fontSize: 26 }}>{n}</b><br /><small>{label}</small></Link>;
  return (
    <>
      <h1>Overview <Link href="/admin/mailer/email/new" className="pri">New email</Link></h1>
      <div className="bar" style={{ flexWrap: "wrap" }}>
        {stat(d.subscribed, "subscribed")}{stat(d.new30, "joined in 30 days")}{stat(d.unsubscribed30, "left in 30 days")}{stat(d.unconfirmed, "unconfirmed")}
        {stat(d.inactive, "inactive (never open)", "?status=inactive")}{stat(d.bounced + d.complained, "bounced / complained", "?status=bounced")}
      </div>
      {d.next.length > 0 && <><h2>Scheduled</h2>{d.next.map((c: any) => <p key={c.id}><Link href="/admin/mailer/emails">{c.subject}</Link> <small>{when(c.scheduled_at)}</small></p>)}</>}
      <h2>Latest emails</h2>
      <table className="mp-table">
        <thead><tr><th>Email</th><th>Sent</th><th>Opened</th><th>Clicked</th><th>Unsubscribed</th></tr></thead>
        <tbody>{d.recent.map((c: any) => <tr key={c.id}><td><b>{c.subject}</b><br /><small>{when(c.sent_at)}</small></td><td>{c.sent}</td><td>{pct(c.opened, c.sent)}</td><td>{pct(c.clicked, c.sent)}</td><td>{pct(c.unsubscribed, c.sent)}</td></tr>)}</tbody>
      </table>
      {!d.recent.length && <p className="sub">Nothing sent yet.</p>}
    </>
  );
}

function Lists({ s, reload }: Props) {
  const [f, setF] = useState<{ id?: number; name: string; description: string } | null>(null);
  const [msg, setMsg] = useState("");
  const save = async () => { try { await rpc("saveList", f!); setF(null); setMsg(""); reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <>
      <h1>Lists {!f && <button className="pri" onClick={() => setF({ name: "", description: "" })}>New list</button>}</h1>
      <p className="sub">Each list is independent. Send an email to one or several, and point signup forms at the lists they should fill.</p>
      {msg && <Notice kind="error">{msg}</Notice>}
      {f && (
        <div className="card" style={{ padding: 14, marginBottom: 14, maxWidth: 560 }}>
          <label className="field"><span>Name</span><input value={f.name} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field"><span>Description (only you see this)</span><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="bar"><button className="pri" onClick={save}>Save</button><button onClick={() => setF(null)}>Cancel</button></div>
        </div>)}
      <table className="mp-table">
        <thead><tr><th>Name</th><th>Subscribed</th><th>Unconfirmed</th><th>Unsubscribed</th><th>Created</th></tr></thead>
        <tbody>
          {s.lists.map((l) => (
            <tr key={l.id}>
              <td><b>{l.name}</b><br /><small>{l.description}</small>
                <div className="mp-act"><button onClick={() => setF({ id: l.id, name: l.name, description: l.description })}>Edit</button><Link href={"/admin/mailer/subscribers?list=" + l.id}>View subscribers</Link>
                  <button className="bad" onClick={async () => { if (await confirmDialog(`Delete the list "${l.name}"? Its subscribers stay; only the list goes.`, { ok: "Delete", danger: true })) { await rpc("deleteList", { id: l.id }); reload(); } }}>Delete</button></div></td>
              <td>{l.subscribed}</td><td>{l.unconfirmed}</td><td>{l.unsubscribed}</td><td>{when(l.created_at)}</td>
            </tr>))}
        </tbody>
      </table>
      {!s.lists.length && <p className="sub">No lists yet.</p>}
    </>
  );
}

function Settings({ s, reload }: Props) {
  const c: Cfg = s.cfg;
  const [f, setF] = useState({ fromName: c.fromName, from: c.from, replyTo: c.replyTo, siteUrl: c.siteUrl, aiModel: c.aiModel, doubleOptIn: c.doubleOptIn, trackOpens: c.trackOpens, trackClicks: c.trackClicks, confirmSubject: c.confirmSubject, confirmBody: c.confirmBody, welcomeOn: c.welcomeOn, welcomeSubject: c.welcomeSubject, welcomeBody: c.welcomeBody, perMinute: c.perMinute, perDay: c.perDay, smtp2goKey: "", smtpUrl: "", deepseekKey: "" });
  const [msg, setMsg] = useState("");
  const text = (k: keyof typeof f, label: string, ph = "", secret = false, hint = "") => (
    <label className="field"><span>{label}</span>
      <input type={secret ? "password" : "text"} autoComplete="off" value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })}
        placeholder={secret && c.isSet[k] ? "•••••• saved — leave blank to keep, or type - to remove" : ph} />{hint && <small>{hint}</small>}</label>
  );
  return (
    <>
      <h1>Settings</h1>
      <div className="card" style={{ padding: 16, maxWidth: 700 }}>
        <h2>Basics</h2>
        {text("fromName", "Default sender name", "Kzoo Makers")}
        {text("from", "Default sender address", "news@kzoomakers.org", false, "Must be a verified sender in SMTP2GO (or allowed by your SMTP server).")}
        {text("replyTo", "Reply-to address (optional)", "info@kzoomakers.org")}
        {text("siteUrl", "Website address (used in email links)", "https://kzoomakers.org")}
        <h2>Sign-up confirmation</h2>
        <label className="in"><input type="checkbox" checked={f.doubleOptIn} onChange={(e) => setF({ ...f, doubleOptIn: e.target.checked })} /> Require new subscribers to confirm their email address (recommended)</label>
        {f.doubleOptIn && <>
          {text("confirmSubject", "Confirmation email subject")}
          <label className="field"><span>Confirmation email message (must contain {"{{link}}"})</span><textarea rows={6} value={f.confirmBody} onChange={(e) => setF({ ...f, confirmBody: e.target.value })} /></label></>}
        <h2>Welcome email</h2>
        <label className="in"><input type="checkbox" checked={f.welcomeOn} onChange={(e) => setF({ ...f, welcomeOn: e.target.checked })} /> Send a welcome email when someone subscribes (once per person)</label>
        {f.welcomeOn && <>
          {text("welcomeSubject", "Welcome email subject")}
          <label className="field"><span>Message ({"{{name}}"} is replaced by their name)</span><textarea rows={5} value={f.welcomeBody} onChange={(e) => setF({ ...f, welcomeBody: e.target.value })} /></label></>}
        <h2>Tracking</h2>
        <label className="in"><input type="checkbox" checked={f.trackOpens} onChange={(e) => setF({ ...f, trackOpens: e.target.checked })} /> Count opens (adds a 1×1 image to each email)</label>
        <label className="in"><input type="checkbox" checked={f.trackClicks} onChange={(e) => setF({ ...f, trackClicks: e.target.checked })} /> Count link clicks (links pass through this site first)</label>
        <p className="sub">See the results under <Link href="/admin/mailer/tracking">Tracking</Link>. Only site administrators can see who opened or clicked.</p>
        <h2>Sending speed</h2>
        <label className="field"><span>Emails per minute (0 = as fast as possible)</span><input type="number" min={0} value={f.perMinute} onChange={(e) => setF({ ...f, perMinute: +e.target.value })} /><small>Slower sending protects your sender reputation with new domains.</small></label>
        <label className="field"><span>Emails per day (0 = no limit)</span><input type="number" min={0} value={f.perDay} onChange={(e) => setF({ ...f, perDay: +e.target.value })} /><small>Set this a little under your email provider's daily cap. Once it is reached, a newsletter in progress pauses and carries on after midnight (Detroit time). Sign-in links, password resets and signing codes are never held back.</small></label>
        <h2>Bounces and spam complaints</h2>
        <p className="sub">In SMTP2GO go to Settings → Webhooks and add this URL for the bounce, spam and unsubscribe events. Those people are then never emailed again.</p>
        <code style={{ wordBreak: "break-all" }}>{typeof location !== "undefined" ? (f.siteUrl || location.origin) : ""}/mail/webhook?k={c.webhookKey}</code>
        <h2>Send with</h2>
        {text("smtp2goKey", "SMTP2GO API key (recommended)", "api-…", true)}
        {text("smtpUrl", "…or any SMTP server", "smtps://user:password@mail.example.com:465", true)}
        <h2>AI compose</h2>
        {text("deepseekKey", "DeepSeek API token", "sk-…", true)}
        {text("aiModel", "Model (optional)", "deepseek-chat")}
        <div className="bar"><button className="pri" onClick={async () => { try { await rpc("saveCfg", { cfg: f }); setF({ ...f, smtp2goKey: "", smtpUrl: "", deepseekKey: "" }); setMsg("Settings saved."); reload(); } catch (e: any) { setMsg(e.message); } }}>Save settings</button>
          {msg && <Notice kind={msgKind(msg)}>{msg}</Notice>}</div>
      </div>
    </>
  );
}

/** Emails waiting to be (re)sent. Each failed try waits twice as long as the one before; after 8 tries a message stays here as "gave up" until someone deletes it. */
function Queue() {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(() => rpc<any[]>("queue").then(setRows, (e) => alertDialog(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const drop = (args: object) => rpc("dropQueued", args).then(load, (e) => alertDialog(e.message));
  return (
    <>
      <h1>Queue {!!rows?.length && <button style={{ color: "var(--bad)" }} onClick={async () => { if (await confirmDialog(`Delete all ${rows.length} queued emails? They will never be sent.`, { ok: "Delete all", danger: true })) drop({ all: true }); }}>Delete all</button>}</h1>
      <p className="sub">Emails that are waiting to go out. These failed and are tried again (after 2, 4, 8 minutes and so on, up to 8 tries).</p>
      {!rows ? <p>Loading…</p> : !rows.length ? <p className="sub">Nothing is waiting. 🎉</p> : (
        <table className="mp-table">
          <thead><tr><th>To</th><th>Subject</th><th>Why waiting</th><th>Tries</th><th>Next try</th><th>Last error</th><th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.recipient}</td><td>{r.subject}</td><td><b style={{ color: "var(--bad)" }}>Retrying</b></td><td>{r.tries}</td><td>{r.gave_up ? <b style={{ color: "var(--bad)" }}>gave up</b> : when(r.next_at)}</td><td><small>{r.last_error}</small></td>
            <td><button onClick={async () => { if (await confirmDialog(`Delete the email to ${r.recipient}?`)) drop({ ids: [r.id] }); }}>Delete</button></td></tr>)}</tbody>
        </table>)}
    </>
  );
}
