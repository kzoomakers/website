"use client";
import { useEffect, useRef, useState } from "react";
import Captcha, { resetCaptcha } from "@/components/captcha";

type Slot = { block: number; date: string; start: string; end: string; left: number };
const SCREEN = () => `${screen.width}x${screen.height}`;
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const time = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const CSS = `.tb label{display:block;margin-bottom:14px;font-weight:600}.tb input:not([type=checkbox]),.tb select,.tb textarea{display:block;width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d5d9de;border-radius:8px;font:inherit}
.tb .tb-slots{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 22px}.tb .tb-slots button{padding:8px 14px;border:1px solid #f9b234;border-radius:8px;background:#fff;cursor:pointer;font:inherit}.tb .tb-slots button:hover{background:#fff6e0}
.tb .tb-areas label{display:inline-block;font-weight:400;margin-right:16px}.tb .tb-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.tb .tb-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px}.tb .tb-err{color:#b3261e}
.tb .tb-pause{display:flex;gap:22px;align-items:center;margin:0 0 26px;padding:18px 22px 18px 18px;background:#fff6e0;border:1px solid #f9b234;border-left-width:5px;border-radius:12px}.tb .tb-pause p{margin:0;line-height:1.55;font-size:1.05em}
.tb .tb-man{flex:0 0 230px;width:230px;height:260px;padding:0;border:0;border-radius:10px;overflow:hidden;cursor:zoom-in;background:none;box-shadow:0 6px 18px rgba(120,80,0,.25);transform:rotate(-1.5deg);transition:transform .2s,box-shadow .2s}.tb .tb-man:hover,.tb .tb-man:focus-visible{transform:rotate(0) scale(1.02);box-shadow:0 10px 24px rgba(120,80,0,.32)}.tb .tb-man img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.tb dialog.tb-lb{border:0;padding:0;background:none;max-width:94vw;max-height:94vh;overflow:visible}.tb dialog.tb-lb::backdrop{background:rgba(20,14,4,.82)}.tb .tb-lb img{display:block;max-width:94vw;max-height:90vh;border-radius:10px;box-shadow:0 12px 50px rgba(0,0,0,.6)}.tb .tb-lb button{position:absolute;top:-14px;right:-14px;width:38px;height:38px;border:0;border-radius:50%;background:#fff;color:#222;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}
@media(max-width:600px){.tb .tb-pause{flex-direction:column;text-align:center;padding:16px}.tb .tb-man{flex-basis:auto;width:min(230px,70%);height:auto;aspect-ratio:230/260}.tb .tb-lb button{top:8px;right:8px}}`;

const fields = (f: FormData) => ({ first: f.get("first"), last: f.get("last"), email: f.get("email"), phone: f.get("phone"), zip: f.get("zip"), contact: f.get("contact"), heard: f.get("heard"), notes: f.get("notes"), website: f.get("website"), captcha: f.get("g-recaptcha-response"), screen: SCREEN(), areas: f.getAll("areas") });

// Public tour booking: pick an open time, give your details. Replaces the old Google Form.
export default function Booking() {
  const lb = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<{ pause: string | null; slots: Slot[]; areas: string[]; heard: string[]; contact: string[] } | null>(null), [pick, setPick] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [done, setDone] = useState<Slot | null>(null), [ask, setAsk] = useState(false), [asked, setAsked] = useState(false);
  useEffect(() => { fetch("/api/tours").then((r) => (r.ok ? r.json() : Promise.reject())).then(setData, () => setErr("Couldn't load tour times. Please try again later.")); }, []);
  const go = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!pick) return;
    setBusy(true); setErr("");
    const form = e.currentTarget, f = new FormData(form);
    const r = await fetch("/api/tours", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      block: pick.block, start: pick.start, ...fields(f) }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(pick); else { setErr(r ? await r.text() : "Couldn't reach the server. Please try again."); resetCaptcha(form); }
  };
  const sendReq = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr("");
    const form = e.currentTarget, f = new FormData(form);
    const r = await fetch("/api/tours", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: true, ...fields(f) }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setAsked(true); else { setErr(r ? await r.text() : "Couldn't reach the server. Please try again."); resetCaptcha(form); }
  };
  if (asked) return <div role="status"><h2>Request received!</h2>{data?.pause ? <p>{data.pause}</p> : <p>Thanks. A volunteer will email you a few dates that work for them, and you pick the one you like. Keep an eye on your inbox (and spam folder).</p>}</div>;
  if (done) return <div role="status"><h2>You're booked!</h2><p>See you on <strong>{day(done.date)} at {time(done.start)}</strong>. We've emailed you a confirmation with a link to cancel if your plans change.</p></div>;
  if (!data) return <p role={err ? "alert" : undefined} className={err ? "tb-err" : undefined}>{err || "Loading tour times…"}</p>;
  const days = [...new Set(data.slots.map((s) => s.date))];
  // The same questions whether you book a time or ask for one, so staff see the same details either way.
  const details = (
    <>
      <div className="tb-row"><label>First name<input name="first" required maxLength={60} autoComplete="given-name" /></label><label>Last name<input name="last" required maxLength={60} autoComplete="family-name" /></label></div>
      <label>Email <small>(we send your confirmation here)</small><input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
      <div className="tb-row"><label>Phone<input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="269 555 0123" /></label><label>Zip code<input name="zip" required inputMode="numeric" pattern="\d{5}(-\d{4})?" title="5 digits, like 49001" placeholder="49001" maxLength={10} autoComplete="postal-code" /></label></div>
      <label>Preferred contact method<select name="contact" defaultValue="Text message">{data.contact.map((c) => <option key={c}>{c}</option>)}</select></label>
      <fieldset className="tb-areas" style={{ border: 0, padding: 0, margin: "0 0 14px" }}><legend style={{ fontWeight: 600 }}>Which areas interest you? <small>(optional)</small></legend>
        {data.areas.map((a) => <label key={a}><input type="checkbox" name="areas" value={a} /> {a}</label>)}</fieldset>
      <label>How did you hear about us? <small>(optional)</small><select name="heard" defaultValue=""><option value="">Select…</option>{data.heard.map((h) => <option key={h}>{h}</option>)}</select></label>
      <label>Notes or additional info <small>(optional)</small><textarea name="notes" maxLength={1000} rows={3} placeholder="Accessibility needs, projects you have in mind…" /></label>
      <div className="tb-hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <Captcha />
    </>
  );
  return (
    <div className="tb">
      <style>{CSS}</style>
      {!pick && (ask || !days.length) ? (
        <form onSubmit={sendReq}>
          {data.pause && <div className="tb-pause" role="status"><button type="button" className="tb-man" aria-label="Enlarge photo" onClick={() => lb.current?.showModal()}><img src="/images/move-the-mill-man.webp" alt="Move the Mill" /></button><p>{data.pause}</p><dialog ref={lb} className="tb-lb" aria-label="Move the Mill photo" onClick={() => lb.current?.close()}><img src="/images/move-the-mill-man.webp" alt="Move the Mill" /><button type="button" aria-label="Close" onClick={() => lb.current?.close()}>✕</button></dialog></div>}
          <p>{data.pause ? "" : days.length ? "Can't find a time that works? Tell us a bit about yourself and a volunteer will contact you with some different dates." : "Tell us a bit about yourself and a volunteer will email you some dates that work for them. You pick the one you like."}</p>
          {details}
          {err && <p className="tb-err" role="alert">{err}</p>}
          <p><small>You consent to emails strictly to coordinate booking or scheduling this tour.</small></p>
          <button className="btn btn-main" disabled={busy}>{busy ? "Sending…" : days.length ? "Contact me with different times" : "Request a tour"}</button>
          {days.length > 0 && <> <button type="button" className="btn" onClick={() => { setAsk(false); setErr(""); }}>← Back to open times</button></>}
        </form>
      ) : !pick ? (
        <>
          <p>Choose a time for a guided tour of the space.</p>
          {days.map((d) => (
            <div key={d}><h3>{day(d)}</h3><div className="tb-slots">{data.slots.filter((s) => s.date === d).map((s) => <button key={s.block + s.start} onClick={() => setPick(s)}>{time(s.start)}–{time(s.end)}</button>)}</div></div>
          ))}
          <p>Nothing that works? <button type="button" className="btn" onClick={() => setAsk(true)}>Contact me with different times</button></p>
        </>
      ) : (
        <form onSubmit={go}>
          <p><button type="button" className="btn" onClick={() => { setPick(null); setErr(""); }}>← Other times</button> <strong>{day(pick.date)}, {time(pick.start)}–{time(pick.end)}</strong></p>
          {details}
          <p><small>You consent to emails strictly to coordinate booking or scheduling this tour.</small></p>
          {err && <p className="tb-err" role="alert">{err}</p>}
          <button className="btn btn-main" disabled={busy}>{busy ? "Booking…" : "Book this tour"}</button>
        </form>
      )}
    </div>
  );
}
