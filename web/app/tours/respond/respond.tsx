"use client";
import { useEffect, useState } from "react";

type Info = { name: string; status: string; guide: string; offers: { i: number; label: string; past: boolean }[] };

// Choosing needs a click on this page (not just opening the emailed link) so email scanners that prefetch links can't book or decline for someone.
export default function Respond({ token, pick, none }: { token: string; pick: number; none: boolean }) {
  const [info, setInfo] = useState<Info | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<{ declined: boolean; when?: string } | null>(null), [asking, setAsking] = useState(none);
  useEffect(() => { fetch(`/api/tours/respond?token=${encodeURIComponent(token)}`).then(async (r) => (r.ok ? setInfo(await r.json()) : setErr(await r.text())), () => setErr("Couldn't reach the server. Please try again.")); }, [token]);
  const go = async (p: number | null, note = "") => {
    setBusy(true); setErr("");
    const r = await fetch("/api/tours/respond", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, pick: p, note }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(await r.json()); else setErr(r ? await r.text() : "Couldn't reach the server. Please try again.");
  };
  if (done) return done.declined
    ? <p role="status"><strong>Got it.</strong> Your request went back to the volunteers, and someone will email you new dates.</p>
    : <p role="status"><strong>You're booked!</strong> See you {done.when}. We've emailed you a confirmation with a link to cancel if your plans change.</p>;
  if (!info) return <p role={err ? "alert" : undefined} style={err ? { color: "#b3261e" } : undefined}>{err || "Loading…"}</p>;
  if (info.status !== "offered") return <p role="status">{info.status === "scheduled" ? "You've already picked a time. Check your email for the confirmation." : "These times are no longer on offer. A volunteer will be in touch if new ones come up."}</p>;
  const live = info.offers.filter((o) => !o.past);
  return (
    <div>
      {err && <p role="alert" style={{ color: "#b3261e" }}>{err}</p>}
      {asking || !live.length ? (
        <form onSubmit={(e) => { e.preventDefault(); go(null, String(new FormData(e.currentTarget).get("note") ?? "")); }}>
          <p>{live.length ? "None of these work? We'll send your request back to the volunteers." : "These times have passed. We'll send your request back to the volunteers for new ones."}</p>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 14 }}>Anything that would help us pick better times? <small>(optional)</small>
            <textarea name="note" maxLength={500} rows={3} placeholder="e.g. weekday evenings or Saturdays work best" style={{ display: "block", width: "100%", marginTop: 6, padding: "10px 12px", border: "1px solid #d5d9de", borderRadius: 8, font: "inherit" }} /></label>
          <button className="btn btn-main" disabled={busy}>{busy ? "Sending…" : "Request other times"}</button> {live.length > 0 && <button type="button" className="btn" onClick={() => setAsking(false)}>← Back to the times</button>}
        </form>
      ) : (
        <>
          <p>Hi {info.name}! {info.guide || "A volunteer"} can give you a tour at any of these times. Click the one that works for you:</p>
          <div style={{ display: "grid", gap: 10, margin: "14px 0 22px" }}>
            {live.map((o) => <button key={o.i} className={`btn${o.i === pick ? " btn-main" : ""}`} autoFocus={o.i === pick} disabled={busy} onClick={() => go(o.i)} style={{ textAlign: "left", padding: "12px 16px" }}>{o.label}</button>)}
          </div>
          <p>None of these work? <button type="button" className="btn" onClick={() => setAsking(true)}>Request other times</button></p>
        </>
      )}
    </div>
  );
}
