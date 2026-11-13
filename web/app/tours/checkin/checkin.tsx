"use client";
import { useEffect, useState } from "react";

const SAY: Record<string, string> = { interested: "Yes, I'm still interested", not_now: "Not right now", not_interested: "No longer interested" }, UNSUB = "unsubscribed";
const MSG: Record<string, string> = { interested: "Thanks! You're still in line, and a volunteer will email you tour times.", not_interested: "Got it, we won't email you about tours again.", unsubscribed: "You're unsubscribed. We won't email you about tour signups, scheduling or openings." };

// An answer needs a click on this page (not just opening the emailed link) so email scanners that prefetch links can't answer for someone.
export default function Checkin({ token, first }: { token: string; first: string }) {
  const [info, setInfo] = useState<{ name: string; open: boolean; upcoming: string[]; offered: boolean; waiting: boolean; paused: boolean } | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<{ answer: string; until: string | null } | null>(null);
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
  // What unsubscribing cuts off depends on where this person is in the process, so say that, not just a generic warning.
  const cost = [
    ...info.upcoming.map((w) => `You have a tour booked for ${w}. If you unsubscribe we can't email you if we have to cancel or move it, and you won't get a reminder. Your booking stays, and you can still cancel from the link in your confirmation email.`),
    info.offered && "We've offered you tour times and you haven't picked one yet. Unsubscribing takes those offers back, so the links in that email stop working and you won't be able to choose a time.",
    info.waiting && (info.paused ? "We're not booking tours right now. If you unsubscribe we can't tell you when tours resume." : "You're in line for a tour. If you unsubscribe you're removed from the line and we won't offer you times."),
  ].filter(Boolean) as string[];
  if (pick === UNSUB) return (
    <form onSubmit={go}>
      <p>Hi {info.name}.</p>
      <div role="alert" style={{ border: "2px solid #b3261e", borderRadius: 8, padding: "12px 16px", margin: "12px 0" }}>
        <p style={{ marginTop: 0 }}><strong>This is permanent. If you unsubscribe, Kzoo Makers will not email you about tours again.</strong></p>
        {cost.length > 0 && <><p>Because of where you are right now:</p><ul>{cost.map((c) => <li key={c}>{c}</li>)}</ul></>}
        <p style={{ marginBottom: 0 }}>It can't be undone from this page, and our volunteers won't be able to send you tour times later. If you book a tour yourself on our website you'll still get the confirmation email, and nothing else.</p>
      </div>
      {err && <p role="alert" style={{ color: "#b3261e" }}>{err}</p>}
      <button className="btn btn-main" disabled={busy}>{busy ? "Unsubscribing…" : "Yes, permanently unsubscribe me"}</button> <button type="button" className="btn" onClick={() => setPick("")}>No, go back</button>
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
