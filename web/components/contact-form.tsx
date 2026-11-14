"use client";
import { useState } from "react";

const COPY = {
  contact: { title: "Send us a message", sub: "Questions, tours, ideas: we read everything and reply by email.", ph: "How can we help?" },
  board: { title: "Contact the Board", sub: "Feedback, concerns or proposals for the board of directors. Members and neighbors are welcome.", ph: "What would you like the board to know?" },
};
const MAX = 3000;
export const CSS = `
.cf{max-width:620px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 6px 28px rgba(0,0,0,.09);padding:32px clamp(20px,5vw,36px);text-align:left;color:#333}
.cf h3{margin:0 0 6px;font-weight:700;color:#444}.cf .cf-sub{margin:0 0 22px;color:#6c757d}
.cf .cf-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:560px){.cf .cf-row{grid-template-columns:1fr}}
.cf label{display:block;margin-bottom:14px;font-size:14px;font-weight:600;color:#555}
.cf input,.cf textarea{display:block;width:100%;margin-top:6px;padding:11px 13px;border:1px solid #d5d9de;border-radius:8px;font:inherit;font-weight:400;color:#222;background:#fafbfc;transition:border-color .15s,box-shadow .15s}
.cf input:focus,.cf textarea:focus{outline:0;border-color:#f9b234;box-shadow:0 0 0 3px rgba(249,178,52,.28);background:#fff}
.cf textarea{min-height:140px;resize:vertical}
.cf .cf-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px}
.cf small{color:#8a929a}.cf .cf-err{color:#b3261e;margin:0 0 12px}
.cf .cf-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.cf .cf-ok{text-align:center;padding:12px 0}.cf .cf-ok span{display:inline-grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#e6f6ec;color:#1b7f3b;font-size:28px;margin-bottom:10px}
`;

// Public contact card. kind="contact" mails the general inbox, kind="board" mails the board. Spam handling is server-side (lib/contact.ts).
export function ContactForm({ kind, heading }: { kind: "contact" | "board"; heading?: string }) {
  const c = COPY[kind], [busy, setBusy] = useState(false), [err, setErr] = useState(""), [done, setDone] = useState(false), [len, setLen] = useState(0);
  const go = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr("");
    const f = new FormData(e.currentTarget), r = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ...Object.fromEntries(["name", "email", "subject", "message", "website"].map((k) => [k, f.get(k)])) }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(true); else setErr(r ? await r.text() : "Couldn't reach the server. Please try again.");
  };
  return (
    <section className="contact-us" style={{ padding: "40px 16px" }}>
      <style>{CSS}</style>
      <div className="cf">
        {done ? (
          <div className="cf-ok" role="status"><span aria-hidden>✓</span><h3>Message sent</h3><p className="cf-sub" style={{ margin: 0 }}>Thank you! We'll get back to you by email.</p></div>
        ) : (
          <form onSubmit={go}>
            <h3>{heading || c.title}</h3>
            <p className="cf-sub">{c.sub}</p>
            <div className="cf-row">
              <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>
              <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
            </div>
            <label>Subject <small>(optional)</small><input name="subject" maxLength={150} /></label>
            <label>Message<textarea name="message" required minLength={10} maxLength={MAX} placeholder={c.ph} onChange={(e) => setLen(e.target.value.length)} /></label>
            <div className="cf-hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            {err && <p className="cf-err" role="alert">{err}</p>}
            <div className="cf-foot">
              <small>{len}/{MAX}</small>
              <button className="btn btn-main" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
