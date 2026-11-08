"use client";
import { useEffect, useRef, useState } from "react";
import type { Klass, Proposal } from "@/lib/crm";
import "./classes.css";

const LEVELS = [["all", "All levels", "Anyone can join"], ["beginner", "Beginner", "No experience needed"], ["intermediate", "Intermediate", "Some hands-on time"], ["advanced", "Advanced", "Confident makers"]] as const;
const post = (url: string, body: object) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
const local = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const day = (s: string) => new Date(s).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const time = (s: string) => new Date(s).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

type View = Pick<Klass, "title" | "summary" | "description" | "starts_at" | "location" | "instructor" | "capacity" | "price" | "image" | "level" | "prerequisites" | "materials"> & { signed?: number };

/** One class as a poster card; used for the live listing and for the preview while proposing. */
function Card({ c, children }: { c: View; children?: React.ReactNode }) {
  const d = c.starts_at ? new Date(c.starts_at) : null, ok = d && !isNaN(+d), lv = LEVELS.find((l) => l[0] === c.level) ?? LEVELS[0];
  return (
    <article className="cl-card">
      <div className="cl-art">
        {c.image ? <img src={c.image} alt="" /> : <span aria-hidden>{(c.title || "?")[0].toUpperCase()}</span>}
        {ok && <div className="cl-date" aria-hidden>{d.toLocaleDateString([], { month: "short" })}<b>{d.getDate()}</b></div>}
      </div>
      <div className="cl-body">
        <span className="cl-lv" style={{ ["--lv" as any]: `var(--lv-${lv[0]})` }}>{lv[1]}</span>
        <h3>{c.title || "Your class title"}</h3>
        {ok && <p className="cl-meta">{day(c.starts_at)} · {time(c.starts_at)}{c.location && <> · {c.location}</>}</p>}
        <p className="cl-meta">{c.instructor ? `with ${c.instructor}` : ""}{c.instructor && c.price ? " · " : ""}{c.price}</p>
        {(c.summary || c.description) && <p className="cl-sum">{c.summary || c.description.slice(0, 140)}</p>}
        {(c.description || c.prerequisites || c.materials) && (
          <details className="cl-more"><summary>Details</summary><dl>
            {c.description && <><dt>About</dt><dd>{c.description}</dd></>}
            {c.prerequisites && <><dt>Before you come</dt><dd>{c.prerequisites}</dd></>}
            {c.materials && <><dt>Bring / provided</dt><dd>{c.materials}</dd></>}
          </dl></details>)}
        {children && <div className="cl-foot">{children}</div>}
      </div>
    </article>
  );
}

export default function Classes({ initial, proposals: p0, minDays }: { initial: Klass[]; proposals: Proposal[]; minDays: number }) {
  const [tab, setTab] = useState<"browse" | "teach">("browse"), [rows, setRows] = useState(initial), [props, setProps] = useState(p0), [err, setErr] = useState(""), [busy, setBusy] = useState(0), [lvl, setLvl] = useState("");
  const act = async (op: "signup" | "cancel", id: number) => {
    setBusy(id); setErr("");
    const r = await post("/api/members", { op, id });
    setBusy(0);
    if (r?.ok) setRows(await r.json()); else setErr(r ? await r.text() : "Network error. Try again.");
  };
  const shown = rows.filter((c) => !lvl || c.level === lvl || c.level === "all");
  const waiting = props.filter((x) => x.status === "pending").length;
  return (
    <div className="cl">
      <div className="cl-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "browse"} onClick={() => setTab("browse")}>Upcoming classes</button>
        <button role="tab" aria-selected={tab === "teach"} onClick={() => setTab("teach")}>Teach a class{waiting > 0 && <b aria-label={`${waiting} waiting for review`}>{waiting}</b>}</button>
      </div>
      {tab === "browse" ? <>
        <div className="cl-chips" role="group" aria-label="Filter by level">
          {[["", "All"], ...LEVELS.slice(1).map((l) => [l[0], l[1]])].map(([v, t]) => <button key={v} aria-pressed={lvl === v} onClick={() => setLvl(v)}>{t}</button>)}
        </div>
        {err && <p role="alert" className="cl-err">{err}</p>}
        <div className="cl-grid">
          {shown.map((c) => {
            const full = c.capacity > 0 && c.signed >= c.capacity, left = c.capacity - c.signed;
            return (
              <Card key={c.id} c={c}>
                {c.capacity > 0 && <><div className="cl-bar" role="img" aria-label={`${Math.min(c.signed, c.capacity)} of ${c.capacity} spots taken`}><i style={{ width: `${Math.min(100, (c.signed / c.capacity) * 100)}%` }} /></div>
                  <small className="cl-meta">{full ? `Full${c.signed > c.capacity ? ` · ${c.signed - c.capacity} waiting` : ""}` : `${left} spot${left === 1 ? "" : "s"} left`}</small></>}
                {c.mine ? <span><span className="cl-ok">{c.mine === "confirmed" ? "✓ You're in" : "You're on the waitlist"}</span> <button className="btn btn-sm" disabled={busy === c.id} onClick={() => act("cancel", c.id)}>Cancel</button></span>
                  : <button className="btn btn-main btn-sm" disabled={busy === c.id} onClick={() => act("signup", c.id)}>{full ? "Join the waitlist" : "Sign up"}</button>}
              </Card>
            );
          })}
        </div>
        {!shown.length && <p>No classes match right now. <a href="#teach" onClick={(e) => { e.preventDefault(); setTab("teach"); }}>Know something worth teaching? Propose one.</a></p>}
      </> : <Teach minDays={minDays} props={props} setProps={setProps} />}
    </div>
  );
}

const BLANK = { title: "", summary: "", level: "all", description: "", duration_min: 120, capacity: 8, price: "", materials: "", prerequisites: "", starts_at: "", location: "", notes: "", image: "" };
const STEPS = ["Idea", "Details", "Schedule", "Artwork"];

function Teach({ minDays, props, setProps }: { minDays: number; props: Proposal[]; setProps: (p: Proposal[]) => void }) {
  const [open, setOpen] = useState(false), [step, setStep] = useState(0), [f, setF] = useState(BLANK), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const min = Math.ceil((Date.now() + minDays * 864e5) / 36e5) * 36e5; // rounded up an hour so the picker never allows a date the server would refuse
  useEffect(() => { try { const d = localStorage.getItem("class-draft"); if (d) setF({ ...BLANK, ...JSON.parse(d) }); } catch {} }, []);
  const set = (k: keyof typeof BLANK, v: string | number) => { const n = { ...f, [k]: v }; setF(n); try { localStorage.setItem("class-draft", JSON.stringify(n)); } catch {} };
  const check = (s: number) =>
    s === 0 ? (f.title.trim() ? "" : "Give your class a title.")
    : s === 1 ? (f.description.trim().length < 40 ? "Tell people what they'll do and learn (a few sentences)." : "")
    : s === 2 ? (!f.starts_at || isNaN(+new Date(f.starts_at)) ? "Pick a date and time." : +new Date(f.starts_at) < min ? `Classes need ${minDays} days' notice. The earliest is ${new Date(min).toLocaleDateString([], { dateStyle: "long" })}.` : "") : "";
  const go = (n: number) => { const e = n > step ? check(step) : ""; setErr(e); if (!e) setStep(n); };
  const upload = async (fl?: File | null) => {
    if (!fl) return; setErr(""); setBusy(true);
    const fd = new FormData(); fd.set("file", fl);
    const r = await fetch("/api/members/art", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (r?.ok) set("image", (await r.json()).url); else setErr(r ? await r.text() : "Network error. Try again.");
  };
  const submit = async () => {
    const e = [0, 1, 2].map(check).find(Boolean); if (e) return setErr(e);
    setBusy(true); setErr("");
    const r = await post("/api/members", { op: "propose", ...f, starts_at: new Date(f.starts_at).toISOString() });
    setBusy(false);
    if (!r?.ok) return setErr(r ? await r.text() : "Network error. Try again.");
    setProps(await r.json()); setSent(true); setOpen(false); setF(BLANK); setStep(0); try { localStorage.removeItem("class-draft"); } catch {}
  };
  const withdraw = async (id: number) => { const r = await post("/api/members", { op: "withdraw", id }); if (r?.ok) setProps(await r.json()); };

  if (!open) return (
    <>
      {sent && <p className="cl-note" role="status">🎉 Sent! A CRM admin will review it and you'll get a notification either way.</p>}
      <div className="cl-hero">
        <div><b>1</b><h3>Pitch it</h3><p>Tell us what you'd teach, who it's for and when you'd like to run it. Pick a date at least {minDays} days out.</p></div>
        <div><b>2</b><h3>We review it</h3><p>A CRM admin checks the details, space and schedule. You'll be notified of the decision.</p></div>
        <div><b>3</b><h3>Members join</h3><p>Once approved it's on the schedule and anyone can sign up, with a waitlist if it fills.</p></div>
      </div>
      <button className="btn btn-main" onClick={() => { setOpen(true); setSent(false); }}>{f.title ? "Continue your draft" : "Propose a class"}</button>
      {props.length > 0 && <div className="cl-mine"><h2 style={{ fontSize: 18, margin: "20px 0 0" }}>Your proposals</h2>
        {props.map((x) => (
          <article key={x.id}>
            <div><strong>{x.title}</strong> <span className={`cl-pill ${x.status}`}>{x.status === "pending" ? "In review" : x.status === "approved" ? "Approved" : "Not approved"}</span>
              <p>{day(x.starts_at)}{x.status === "declined" && x.reason ? ` · ${x.reason}` : ""}</p></div>
            {x.status === "pending" && <button className="btn btn-sm" onClick={() => withdraw(x.id)}>Withdraw</button>}
          </article>))}
      </div>}
    </>
  );

  const preview = { ...f, instructor: "you", starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : "" };
  return (
    <div className="cl-wiz">
      <div>
        <ol className="cl-steps" aria-label="Progress">{STEPS.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>{s}</li>)}</ol>
        <form className="cl-form" onSubmit={(e) => { e.preventDefault(); step < 3 ? go(step + 1) : submit(); }}>
          {step === 0 && <>
            <label>What will you teach?<input autoFocus maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Intro to the laser cutter" /></label>
            <label>One-line pitch <small>Shown on the card. {f.summary.length}/160</small><input maxLength={160} value={f.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Leave with a finished coaster and the confidence to run your own jobs." /></label>
            <fieldset className="cl-lvls"><legend>Who is it for?</legend>
              {LEVELS.map(([v, t, h]) => <label key={v} style={{ ["--lv" as any]: `var(--lv-${v})` }}><input type="radio" name="lvl" checked={f.level === v} onChange={() => set("level", v)} />{t}<span>{h}</span></label>)}
            </fieldset></>}
          {step === 1 && <>
            <label>What will people do and learn? <small>{f.description.length}/2000</small><textarea rows={6} maxLength={2000} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
            <div className="cl-two">
              <label>Length<select value={f.duration_min} onChange={(e) => set("duration_min", Number(e.target.value))}>{[60, 90, 120, 180, 240, 360].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} min`}</option>)}</select></label>
              <label>Max students <small>0 = unlimited</small><input type="number" min={0} max={500} value={f.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /></label>
              <label>Price <small>Optional</small><input maxLength={60} value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="Free, or $25 materials" /></label>
            </div>
            <label>Before they come <small>Skills, safety training or tool authorizations needed. Optional</small><input maxLength={300} value={f.prerequisites} onChange={(e) => set("prerequisites", e.target.value)} /></label>
            <label>Bring / provided <small>Optional</small><input maxLength={300} value={f.materials} onChange={(e) => set("materials", e.target.value)} /></label></>}
          {step === 2 && <>
            <p className="cl-note">Classes need at least <strong>{minDays} days' notice</strong> so we can promote them and prepare the space. The earliest date is <strong>{new Date(min).toLocaleDateString([], { dateStyle: "long" })}</strong>.</p>
            <label>Date and time<input type="datetime-local" min={local(min)} value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
              {!f.starts_at && <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => set("starts_at", local(min))}>Use the earliest date</button>}</label>
            <label>Where in the shop? <small>Optional. An admin confirms the space</small><input maxLength={120} value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Wood shop" /></label></>}
          {step === 3 && <>
            <div className={`cl-drop${over ? " over" : ""}`} role="button" tabIndex={0} onClick={() => file.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && file.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]); }}>
              {busy ? "Uploading…" : f.image ? "Artwork added. Click or drop to replace it." : <><strong>Add artwork</strong><br />Drop an image here or click to choose one. A poster or photo of something you made works well.</>}
            </div>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            {f.image && <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => set("image", "")}>Remove artwork</button>}
            <label>Note to the reviewers <small>Optional. Tools needed, your experience, anything else</small><textarea rows={3} maxLength={500} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label></>}
          {err && <p role="alert" className="cl-err">{err}</p>}
          <div className="cl-nav">
            <button type="button" className="btn" onClick={() => (step ? go(step - 1) : setOpen(false))}>{step ? "Back" : "Save draft & close"}</button>
            <button className="btn btn-main" disabled={busy}>{step < 3 ? "Next" : busy ? "Sending…" : "Send for review"}</button>
          </div>
        </form>
      </div>
      <aside className="cl-prev" aria-label="Preview"><h4>Live preview</h4><Card c={preview as View} /></aside>
    </div>
  );
}
