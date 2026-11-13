"use client";
import { useEffect, useState } from "react";

const SAY: Record<string, string> = { interested: "Yes, I'm still interested", not_now: "Not right now", not_interested: "No longer interested" }, UNSUB = "unsubscribed";
const MSG: Record<string, string> = { interested: "Thanks! You're still in line, and a volunteer will email you tour times.", not_interested: "Got it, we won't email you about tours again. You're always welcome to ask for one later.", unsubscribed: "You're unsubscribed. We won't email you about tour signups, scheduling or openings." };

// An answer needs a click on this page (not just opening the emailed link) so email scanners that prefetch links can't answer for someone.
export default function Checkin({ token, first }: { token: string; first: string }) {
  const [info, setInfo] = useState<{ name: string; open: boolean } | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<{ answer: string; until: string | null } | null>(null);
  const [pick, setPick] = useState(SAY[first] || first === UNSUB ? first : "");
  useEffect(() => { fetch(`/api/tours/checkin?token=${encodeURIComponent(token)}`).then(async (r) => (r.ok ? setInfo(await r.json()) : setErr(await r.text())), () => setErr("Couldn't reach the server. Please try again.")); }, [token]);
  const go = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr("");
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/tours/checkin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, answer: pick, months: Number(f.get("months") ?? 0), note: f.get("note") }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(await r.json()); else setErr(r ? await r.text() : "Couldn't reach the server. Please try again.");
  };
  if (done) return <p role="status"><strong>{done.until ? `Thanks! We'll check back with you around ${new Date(done.until + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` : MSG[done.answer]}</strong></p>;
  if (!info) return <p role={err ? "alert" : undefined} style={err ? { color: "#b3261e" } : undefined}>{err || "Loading…"}</p>;
  if (!info.open && pick !== UNSUB) return <p role="status">This request is already scheduled or closed, so there's nothing to answer. Thank you!</p>;
  const field = { display: "block", width: "100%", marginTop: 6, padding: "10px 12px", border: "1px solid #d5d9de", borderRadius: 8, font: "inherit" } as const;
  if (pick === UNSUB) return (
    <form onSubmit={go}>
      <p>Hi {info.name}.</p>
      <div role="alert" style={{ border: "2px solid #b3261e", borderRadius: 8, padding: "12px 16px", margin: "12px 0" }}>
        <p style={{ marginTop: 0 }}><strong>If you unsubscribe, Kzoo Makers will not contact you about tours again.</strong></p>
        <p style={{ marginBottom: 0 }}>That means no tour times, no reminders, no openings, and no word when tours or signups resume. Your spot in line is removed. You can always come back and ask for a tour later.</p>
      </div>
      {err && <p role="alert" style={{ color: "#b3261e" }}>{err}</p>}
      <button className="btn btn-main" disabled={busy}>{busy ? "Unsubscribing…" : "Yes, unsubscribe me"}</button> <button type="button" className="btn" onClick={() => setPick("")}>No, go back</button>
    </form>
  );
  return (
    <form onSubmit={go}>
      <p>Hi {info.name}! Are you still interested in a tour of Kzoo Makers?</p>
      <div style={{ display: "grid", gap: 10, margin: "14px 0" }}>
        {Object.entries(SAY).map(([k, t]) => <button key={k} type="button" className={`btn${k === pick ? " btn-main" : ""}`} aria-pressed={k === pick} onClick={() => setPick(k)} style={{ textAlign: "left", padding: "12px 16px" }}>{t}</button>)}
      </div>
      {pick === "not_now" && <label style={{ display: "block", fontWeight: 600, marginBottom: 14 }}>When should we check back?
        <select name="months" defaultValue="1" style={field}><option value="1">In 1 month</option><option value="3">In 3 months</option><option value="0">Don't ask again</option></select></label>}
      {pick && pick !== "interested" && <label style={{ display: "block", fontWeight: 600, marginBottom: 14 }}>Anything you'd like us to know? <small>(optional)</small><textarea name="note" maxLength={500} rows={3} style={field} /></label>}
      {err && <p role="alert" style={{ color: "#b3261e" }}>{err}</p>}
      <button className="btn btn-main" disabled={busy || !pick}>{busy ? "Sending…" : "Send my answer"}</button>
      <p><small>Want no more tour emails at all? <button type="button" className="btn" onClick={() => setPick(UNSUB)}>Unsubscribe</button></small></p>
    </form>
  );
}
