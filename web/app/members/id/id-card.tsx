"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Notice from "@/components/notice";
import { IdStep, WZ_CSS } from "../wizard";
import type { Card } from "@/lib/id-card";
import "./id.css";

const post = (url: string, body: object) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r; });
const day = (s: string) => new Date(s + "T12:00:00").toLocaleDateString([], { dateStyle: "long" });
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const SAMPLE = "/images/id-sample.jpg";
const STATE: Record<string, string> = { pending: "Waiting for review", waiting: "We asked you a question", approved: "Approved", rejected: "Not accepted" };

export default function IdCard({ card, unlocked, password, kinds, mb }: { card: Card; unlocked: boolean; password: boolean; kinds: Record<string, string>; mb: number }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false), [pw, setPw] = useState(""), [err, setErr] = useState(""), [info, setInfo] = useState(""), [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false), [replace, setReplace] = useState(false), [reply, setReply] = useState("");
  const stamp = useState(() => Date.now())[0];
  // Once unlocked (on arrival from the emailed link, or after the password), the wipe plays on the next frame so the transition runs.
  useEffect(() => { if (!unlocked) return setOpen(false); const t = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true))); return () => cancelAnimationFrame(t); }, [unlocked]);
  const run = async (fn: () => Promise<unknown>, done?: string) => { setBusy(true); setErr(""); setInfo(""); try { await fn(); if (done) setInfo(done); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const r = card?.renewal, openRenewal = r && (r.state === "pending" || r.state === "waiting");
  const days = card?.days;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
      <style>{WZ_CSS}</style>
      <button type="button" className="idc" data-open={open} aria-label={unlocked ? "Your ID" : "Your ID is hidden. Activate to show it."} onClick={() => !unlocked && setAsk(true)}>
        {unlocked && <img src={`/api/members/id/image?v=${stamp}`} alt="Your photo ID" />}
        <span className="idc-veil" aria-hidden>
          <img className="idc-blur" src={SAMPLE} alt="" />
          <span className="idc-edge" />
        </span>
        {!unlocked && <span className="idc-hint">🔒 Tap to show your ID</span>}
      </button>

      {ask && !unlocked && (
        <form className="card" style={{ display: "grid", gap: 10 }} onSubmit={(e) => { e.preventDefault(); run(() => post("/api/members/id/unlock", { password: pw }).then(() => router.refresh())); }}>
          <b>Confirm it's you</b>
          {password && <>
            <label>Password<input type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <div className="bar"><button className="pri" disabled={busy || !pw}>Show my ID</button></div>
          </>}
          <div className="bar"><button type="button" disabled={busy} onClick={() => run(() => post("/api/members/id/unlock", { mail: true }), "We emailed you a link. Open it to see your ID.")}>Email me a link{password ? " instead" : ""}</button></div>
        </form>
      )}
      <Notice kind="error">{err}</Notice>
      {info && <Notice kind="info">{info}</Notice>}

      {card ? (
        <section className="card" style={{ display: "grid", gap: 6 }}>
          <b>{(kinds[card.kind] ?? card.kind)}</b>
          <span className="sub" style={{ margin: 0 }}>{card.expires_on ? `Expires ${day(card.expires_on)}` : "No expiration date"}{days !== null && days !== undefined && days <= 30 && !openRenewal ? <> · <b style={{ color: "#b45309" }}>{days < 0 ? "expired" : `${days} day${days === 1 ? "" : "s"} left`}</b></> : null}</span>
        </section>
      ) : <p className="sub">No ID on file yet.</p>}

      {r && (
        <section className="card" style={{ display: "grid", gap: 8 }} aria-label="New ID review">
          <b>Your new ID: <span className="tag">{STATE[r.state]}</span></b>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {r.events.map((e) => <li key={e.id} style={{ justifySelf: e.by_member ? "end" : "start", maxWidth: "90%", padding: "6px 10px", borderRadius: 10, background: e.by_member ? "var(--acc-bg)" : "var(--line)" }}><small className="sub">{e.by_member ? "You" : e.actor} · {when(e.at)}</small><div style={{ whiteSpace: "pre-wrap" }}>{e.body}</div></li>)}
          </ol>
          {openRenewal && <form style={{ display: "grid", gap: 6 }} onSubmit={(e) => { e.preventDefault(); run(() => post("/api/members/id/reply", { body: reply }).then(() => { setReply(""); router.refresh(); })); }}>
            <textarea aria-label="Reply" rows={2} maxLength={2000} placeholder="Reply to the team" value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="bar"><button disabled={busy || !reply.trim()}>Send</button></div>
          </form>}
        </section>
      )}

      {replace
        ? <section className="card"><IdStep kinds={kinds} mb={mb} url="/api/members/id" next={() => { setReplace(false); router.refresh(); }} /><div className="bar"><button type="button" onClick={() => setReplace(false)}>Cancel</button></div></section>
        : <div className="bar"><button type="button" className={days !== null && days !== undefined && days <= 30 ? "pri" : ""} onClick={() => setReplace(true)}>{openRenewal ? "Replace the ID I sent" : "Replace license"}</button></div>}
      <small className="sub">🔒 Your ID is encrypted. A new one is checked against the one on file before it replaces it; until then the current one stays valid.</small>
    </div>
  );
}
