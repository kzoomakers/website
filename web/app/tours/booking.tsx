"use client";
import { useEffect, useState } from "react";

type Slot = { block: number; date: string; start: string; end: string; left: number };
const SCREEN = () => `${screen.width}x${screen.height}`;
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const time = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const CSS = `.tb label{display:block;margin-bottom:14px;font-weight:600}.tb input:not([type=checkbox]),.tb select,.tb textarea{display:block;width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d5d9de;border-radius:8px;font:inherit}
.tb .tb-slots{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 22px}.tb .tb-slots button{padding:8px 14px;border:1px solid #f9b234;border-radius:8px;background:#fff;cursor:pointer;font:inherit}.tb .tb-slots button:hover{background:#fff6e0}
.tb .tb-areas label{display:inline-block;font-weight:400;margin-right:16px}.tb .tb-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.tb .tb-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px}.tb .tb-err{color:#b3261e}`;

// Public tour booking: pick an open time, give your details. Replaces the old Google Form.
export default function Booking() {
  const [data, setData] = useState<{ slots: Slot[]; areas: string[]; heard: string[]; contact: string[] } | null>(null), [pick, setPick] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [done, setDone] = useState<Slot | null>(null), [ask, setAsk] = useState(false), [asked, setAsked] = useState(false);
  useEffect(() => { fetch("/api/tours").then((r) => (r.ok ? r.json() : Promise.reject())).then(setData, () => setErr("Couldn't load tour times. Please try again later.")); }, []);
  const go = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!pick) return;
    setBusy(true); setErr("");
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/tours", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      block: pick.block, start: pick.start, name: f.get("name"), email: f.get("email"), phone: f.get("phone"), heard: f.get("heard"), notes: f.get("notes"), website: f.get("website"), screen: SCREEN(), areas: f.getAll("areas") }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(pick); else setErr(r ? await r.text() : "Couldn't reach the server. Please try again.");
  };
  const sendReq = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr("");
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/tours", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: true, first: f.get("first"), last: f.get("last"), email: f.get("email"), phone: f.get("phone"), zip: f.get("zip"), contact: f.get("contact"), notes: f.get("notes"), website: f.get("website"), screen: SCREEN(), areas: f.getAll("areas") }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setAsked(true); else setErr(r ? await r.text() : "Couldn't reach the server. Please try again.");
  };
  if (asked) return <div role="status"><h2>Request received!</h2><p>Thanks. A volunteer will email you a few dates that work for them, and you pick the one you like. Keep an eye on your inbox (and spam folder).</p></div>;
  if (done) return <div role="status"><h2>You're booked!</h2><p>See you on <strong>{day(done.date)} at {time(done.start)}</strong>. We've emailed you a confirmation with a link to cancel if your plans change.</p></div>;
  if (!data) return <p role={err ? "alert" : undefined} className={err ? "tb-err" : undefined}>{err || "Loading tour times…"}</p>;
  const days = [...new Set(data.slots.map((s) => s.date))];
  const notes = <label>Notes or additional info <small>(optional)</small><textarea name="notes" maxLength={1000} rows={3} placeholder="Accessibility needs, projects you have in mind…" /></label>;
  return (
    <div className="tb">
      <style>{CSS}</style>
      {!pick && (ask || !days.length) ? (
        <form onSubmit={sendReq}>
          <p>{days.length ? "Can't find a time that works? Tell us a bit about yourself and a volunteer will offer you some dates." : "Tell us a bit about yourself and a volunteer will email you some dates that work for them. You pick the one you like."}</p>
          <div className="tb-row"><label>First name<input name="first" required maxLength={60} autoComplete="given-name" /></label><label>Last name<input name="last" required maxLength={60} autoComplete="family-name" /></label></div>
          <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
          <div className="tb-row"><label>Phone<input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="269 555 0123" /></label><label>Zip code<input name="zip" required inputMode="numeric" pattern="\d{5}(-\d{4})?" maxLength={10} autoComplete="postal-code" /></label></div>
          <label>Preferred contact method<select name="contact" defaultValue="Email">{data.contact.map((c) => <option key={c}>{c}</option>)}</select></label>
          <fieldset className="tb-areas" style={{ border: 0, padding: 0, margin: "0 0 14px" }}><legend style={{ fontWeight: 600 }}>Which areas interest you? <small>(optional)</small></legend>
            {data.areas.map((a) => <label key={a}><input type="checkbox" name="areas" value={a} /> {a}</label>)}</fieldset>
          {notes}
          <div className="tb-hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          {err && <p className="tb-err" role="alert">{err}</p>}
          <p><small>We keep your IP address, browser and screen size to prevent abuse.</small></p>
          <button className="btn btn-main" disabled={busy}>{busy ? "Sending…" : "Request a tour"}</button>
          {days.length > 0 && <> <button type="button" className="btn" onClick={() => { setAsk(false); setErr(""); }}>← Back to open times</button></>}
        </form>
      ) : !pick ? (
        <>
          <p>Choose a time for a guided tour of the space.</p>
          {days.map((d) => (
            <div key={d}><h3>{day(d)}</h3><div className="tb-slots">{data.slots.filter((s) => s.date === d).map((s) => <button key={s.block + s.start} onClick={() => setPick(s)}>{time(s.start)}–{time(s.end)}</button>)}</div></div>
          ))}
          <p>Nothing that works? <button type="button" className="btn" onClick={() => setAsk(true)}>Request other times</button></p>
        </>
      ) : (
        <form onSubmit={go}>
          <p><button type="button" className="btn" onClick={() => { setPick(null); setErr(""); }}>← Other times</button> <strong>{day(pick.date)}, {time(pick.start)}–{time(pick.end)}</strong></p>
          <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>
          <label>Email <small>(we send your confirmation here)</small><input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
          <label>Phone<input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="269 555 0123" /></label>
          <fieldset className="tb-areas" style={{ border: 0, padding: 0, margin: "0 0 14px" }}><legend style={{ fontWeight: 600 }}>What are you interested in? <small>(optional)</small></legend>
            {data.areas.map((a) => <label key={a}><input type="checkbox" name="areas" value={a} /> {a}</label>)}</fieldset>
          <label>How did you hear about us? <small>(optional)</small><select name="heard" defaultValue=""><option value="">Select…</option>{data.heard.map((h) => <option key={h}>{h}</option>)}</select></label>
          {notes}
          <div className="tb-hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <p><small>By booking you agree to get emails about this tour. We keep your IP address, browser and screen size to prevent abuse.</small></p>
          {err && <p className="tb-err" role="alert">{err}</p>}
          <button className="btn btn-main" disabled={busy}>{busy ? "Booking…" : "Book this tour"}</button>
        </form>
      )}
    </div>
  );
}
