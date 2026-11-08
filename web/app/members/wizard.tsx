"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Notice from "@/components/notice";
import SignPad from "@/components/sign-pad";
import { Agreement } from "@/components/agreement";
import { sendUpload } from "@/lib/upload-client";
import { fileTooLarge } from "@/lib/upload-limit";
import { OPEN_TO } from "@/lib/fields";
import type { Version } from "@/lib/waiver-diff";
import type { Contact } from "@/lib/profiles";
import { useRead } from "./onboarding/use-read";

// The welcome wizard: a modal over every members page. It opens by itself the moment staff approve someone (we poll while they wait),
// or at once if they arrive mid-way. The server enforces the order (lib/onboarding.ts); this only shows the current step. Contact, emergency and directory
// steps are local: the server counts the person as finished once phone, address and one emergency contact exist.
const ORDER = [["waiver", "Waiver"], ["handbook", "Handbook"], ["id", "Photo ID"], ["contact", "Your info"], ["emergency", "Emergency"], ["directory", "Directory"]] as const;
type Screen = (typeof ORDER)[number][0] | "finish";
type Info = { step: string; fresh: boolean; name: string; kinds: Record<string, string>; relationships: string[]; version: Version | null };
const FIRST: Record<string, Screen> = { waiver: "waiver", handbook: "handbook", id: "id", profile: "contact", done: "directory" }; // "done" only counts while `fresh` (the wizard was never finished)
const EMPTY = { first_name: "", last_name: "", phone: "", relationship: "", address: "", business_phone: "" };
const two = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } as const;
const json = (method: string, url: string, body?: unknown) => fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const CSS = `
dialog.wz{border:0;border-radius:16px;padding:0;width:min(720px,calc(100% - 24px));max-height:calc(100dvh - 24px);box-shadow:0 20px 60px rgba(0,0,0,.4);background:var(--card);color:var(--ink);overflow:auto}
dialog.wz::backdrop{background:rgba(0,0,0,.55)}
.wz-top{position:sticky;top:0;z-index:2;background:var(--card);padding:16px 40px 36px;border-bottom:1px solid var(--line);container:wzt/inline-size}
.stp{display:flex;align-items:center}
.stp__step{position:relative;flex:none;z-index:1}
.stp__num{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700;background:var(--line);color:var(--mut);transition:background-color .3s cubic-bezier(.65,0,.35,1),box-shadow .3s cubic-bezier(.65,0,.35,1)}
.stp__name{position:absolute;top:100%;left:50%;transform:translateX(-50%);width:7em;margin-top:6px;text-align:center;font-size:12px;line-height:1.3;color:var(--mut);transition:color .3s cubic-bezier(.65,0,.35,1)}
.stp__step--done .stp__num,.stp__step--current .stp__num{background:var(--acc);color:#fff}
.stp__step--done .stp__name,.stp__step--current .stp__name{color:var(--ink)}
.stp__step--current .stp__name{font-weight:700}
.stp__step--current .stp__num,.stp__step--current .stp__name{transition-delay:.3s}
.stp__step--current .stp__num{box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 40%,transparent)}
.stp__line{flex:1;height:2px;margin:0 4px;background:var(--line)}
.stp__line::before{content:"";display:block;height:100%;background:var(--acc);transform:scaleX(0);transform-origin:0 50%;transition:transform .3s cubic-bezier(.65,0,.35,1)}
.stp__step--done+.stp__line::before{transform:scaleX(1)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.stp__now{display:none;margin:10px 0 0;font-size:13px}
@media(prefers-color-scheme:dark){.stp__step--done .stp__num,.stp__step--current .stp__num{color:#0b1020}}
@container wzt (max-width:30em){.stp__name{display:none}.stp__now{display:block}}
@media(max-width:520px){.wz-top{padding:14px 16px 12px}}
@media(prefers-reduced-motion:reduce){.stp *,.stp__line::before{transition:none!important}}
.wz-body{padding:20px 24px 24px;display:grid;gap:14px}
.wz-body h2{margin:0}.wz-body p{margin:0}.wz-body label{display:grid;gap:4px}
.wz-body select{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:inherit}
.wz-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.wz-chk{display:flex!important;grid-auto-flow:column;gap:8px;align-items:center}
.wz-doc{height:min(46vh,420px);overflow:auto;border:1px solid var(--line);border-radius:8px;padding:16px;background:#fff;color:#111}
@media(max-width:520px){.wz-body{padding-left:14px;padding-right:14px}}`;

export default function Wizard() {
  const [info, setInfo] = useState<Info | null>(null), [screen, setScreen] = useState<Screen | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const dlg = useRef<HTMLDialogElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const started = useRef(false);

  // Until the wizard opens, ask every 20s whether staff have approved us. Once open it is ours to drive, so the answer is never read again.
  useEffect(() => {
    if (screen) return;
    const ask = () => document.hidden ? undefined : fetch("/api/onboarding").then((r) => (r.ok ? r.json() : null)).then(async (j: Info | null) => {
      if (!j || !FIRST[j.step] || (j.step === "done" && !j.fresh) || started.current) return;
      started.current = true;
      // Coming back mid-way: skip "Your info" if phone and address are already saved.
      const p = j.step === "profile" ? (await fetch("/api/account").then((r) => r.json()).catch(() => null))?.profile : null;
      setInfo(j); setScreen(p?.phone && p?.address1 ? "emergency" : FIRST[j.step]);
    }).catch(() => {});
    ask(); const t = setInterval(ask, 20000); return () => clearInterval(t);
  }, [screen]);
  useEffect(() => { if (screen && !dlg.current?.open) dlg.current?.showModal(); }, [screen]);

  const go = (s: Screen) => { setErr(""); setScreen(s); dlg.current?.scrollTo(0, 0); };
  const step = (to: Screen) => async (r: Response) => { setBusy(false); if (r.ok) go(to); else setErr(await r.text()); };
  const post = (body: object, to: Screen) => { setBusy(true); setErr(""); return json("POST", "/api/onboarding", body).then(step(to), () => { setBusy(false); setErr("Couldn't reach the server. Check your connection and try again."); }); };

  const read = useRead(frame, screen === "handbook");
  if (!screen || !info) return null;
  const at = screen === "finish" ? ORDER.length : ORDER.findIndex(([s]) => s === screen);
  return (
    <dialog ref={dlg} className="wz" aria-labelledby="wz-h" onCancel={(e) => e.preventDefault()}>
      <style>{CSS}</style>
      <div className="wz-top">
        <div className="stp" role="group" aria-label="Progress">
          {ORDER.map(([k, l], i) => <Fragment key={k}>
            {i > 0 && <div className="stp__line" aria-hidden />}
            <div className={"stp__step" + (i < at ? " stp__step--done" : i === at ? " stp__step--current" : "")} aria-current={i === at ? "step" : undefined}>
              <div className="stp__num" aria-hidden>{i < at ? "✓" : i + 1}</div>
              <div className="stp__name"><span className="sr-only">{i < at ? "Done: " : ""}</span>{l}</div>
            </div>
          </Fragment>)}
        </div>
        {at < ORDER.length && <p className="stp__now"><b>Step {at + 1} of {ORDER.length}:</b> {ORDER[at][1]}</p>}
      </div>
      <div className="wz-body">
        <Notice kind="error">{err}</Notice>
        {screen === "waiver" && info.version && <>
          <h2 id="wz-h">Welcome, {info.name.split(" ")[0]}! Liability waiver</h2>
          <p className="sub">Please read the whole agreement ({info.version.title}, revision {info.version.revision}), then sign at the bottom. A signed PDF is emailed to you and kept encrypted.</p>
          <article className="wz-doc" tabIndex={0}><Agreement sections={info.version.sections} closing={info.version.closing} /></article>
          <SignPad name={info.name} busy={busy} initials drawRequired label="Sign and continue" onSign={(signature, drawn, initials) => post({ step: "waiver", signature, initials, drawn }, "handbook")} />
        </>}
        {screen === "handbook" && <>
          <h2 id="wz-h">Member handbook</h2>
          <p>Please read the handbook slowly and entirely. It is also available in the members area and our website to check at any time.</p>
          <iframe ref={frame} src="/handbook" title="Membership handbook" style={{ width: "100%", height: "min(52vh,480px)", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
          {read ? <div className="wz-row"><button className="pri" disabled={busy} onClick={() => post({ step: "handbook", read: true }, "id")}>I have read the handbook and agree to follow it</button></div>
            : <p className="sub" role="status">Scroll to the end of the handbook to continue.</p>}
        </>}
        {screen === "id" && <IdStep kinds={info.kinds} next={() => go("contact")} />}
        {screen === "contact" && <ContactStep next={() => go("emergency")} />}
        {screen === "emergency" && <EmergencyStep relationships={info.relationships} next={() => go(info.fresh ? "directory" : "finish")} />}
        {screen === "directory" && <DirectoryStep next={() => go("finish")} />}
        {screen === "finish" && <>
          <h2 id="wz-h" style={{ textAlign: "center", fontSize: 28 }}>🎉 You're all set! 🎉</h2>
          <p style={{ textAlign: "center" }}>Welcome to Kzoo Makers. The members area is yours.</p>
          <div className="wz-row" style={{ justifyContent: "center" }}><button className="pri" onClick={() => { location.href = "/members"; }}>Done</button></div>
        </>}
      </div>
      <p className="sub" style={{ margin: 0, padding: "0 24px 16px", textAlign: "center" }}>Stuck? Email <a href="mailto:contact@kzoomakers.org">contact@kzoomakers.org</a> or <button type="button" onClick={() => fetch("/api/blog/auth", { method: "DELETE" }).then(() => signOut({ callbackUrl: "/" }))} style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>log out</button>.</p>
    </dialog>
  );
}

function useSend() {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  return { busy, err, setErr, run: async (f: () => Promise<Response | null | undefined>, ok: (r: Response) => void) => { setBusy(true); setErr(""); const r = await f().catch(() => null); setBusy(false); r?.ok ? ok(r) : setErr(r ? await r.text() : "Couldn't reach the server. Check your connection and try again."); } };
}

function IdStep({ kinds, next }: { kinds: Record<string, string>; next: () => void }) {
  const s = useSend();
  return <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget), big = fileTooLarge((fd.get("file") as File) ?? { size: 0 });
    if (big) return s.setErr(big);
    s.run(() => sendUpload("/api/onboarding/id", fd), next);
  }}>
    <h2 id="wz-h">Photo ID</h2>
    <p>Upload a photo or scan of a non-expired driver's license or state ID, passport, military ID or college ID.</p>
    <p className="sub">🔒 Your ID is encrypted before it is stored. Only authorized staff can open it, and every view is logged.</p>
    <Notice kind="error">{s.err}</Notice>
    <label>Type of ID<select name="kind" required defaultValue=""><option value="" disabled>Choose…</option>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Expiration date (blank only for a college ID with none)<input type="date" name="expires" min={new Date().toISOString().slice(0, 10)} /></label>
    <label>Photo or scan<input type="file" name="file" accept="image/*,.heic,.heif" required /></label>
    <div className="wz-row"><button className="pri" disabled={s.busy}>{s.busy ? "Uploading…" : "Upload and continue"}</button></div>
  </form>;
}

const FIELDS = ["first_name", "last_name", "phone", "address1", "address2", "city", "state", "zip"] as const;
function ContactStep({ next }: { next: () => void }) {
  const s = useSend(), [f, setF] = useState<Record<string, string> | null>(null);
  useEffect(() => { fetch("/api/account").then((r) => r.json()).then((j) => setF(Object.fromEntries(FIELDS.map((k) => [k, j.profile?.[k] ?? ""])))).catch(() => setF(Object.fromEntries(FIELDS.map((k) => [k, ""])))); }, []);
  if (!f) return <p role="status">Loading…</p>;
  const i = (k: (typeof FIELDS)[number], label: string, extra: object = {}) => <label>{label}<input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={120} {...extra} /></label>;
  return <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => { e.preventDefault(); s.run(() => json("PUT", "/api/account", f), next); }}>
    <h2 id="wz-h">Your contact information</h2>
    <Notice kind="error">{s.err}</Notice>
    <div style={two}>{i("first_name", "First name", { required: true, autoComplete: "given-name" })}{i("last_name", "Last name", { required: true, autoComplete: "family-name" })}</div>
    {i("phone", "Phone", { required: true, type: "tel", autoComplete: "tel", maxLength: 30 })}
    {i("address1", "Address", { required: true, autoComplete: "address-line1" })}
    {i("address2", "Apartment, suite, etc. (optional)", { autoComplete: "address-line2" })}
    <div style={{ ...two, gridTemplateColumns: "2fr 1fr 1fr" }}>{i("city", "City", { required: true, autoComplete: "address-level2" })}{i("state", "State", { required: true, autoComplete: "address-level1" })}{i("zip", "ZIP", { required: true, autoComplete: "postal-code" })}</div>
    <div className="wz-row"><button className="pri" disabled={s.busy}>Next</button></div>
  </form>;
}

function EmergencyStep({ relationships, next }: { relationships: string[]; next: () => void }) {
  const s = useSend(), [list, setList] = useState<Contact[] | null>(null), [f, setF] = useState(EMPTY), [adding, setAdding] = useState(false);
  useEffect(() => { fetch("/api/account").then((r) => r.json()).then((j) => { setList(j.contacts ?? []); setAdding(!j.contacts?.length); }).catch(() => setList([])); }, []);
  if (!list) return <p role="status">Loading…</p>;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const saved = (r: Response) => r.json().then((l: Contact[]) => { setList(l); setF(EMPTY); setAdding(false); });
  return <div style={{ display: "grid", gap: 12 }}>
    <h2 id="wz-h">Emergency contacts</h2>
    <p>Who should we call if something happens while you're at the space? Add at least one; you can add more.</p>
    <Notice kind="error">{s.err}</Notice>
    {list.map((c) => <div key={c.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 16px" }}>
      <span style={{ flex: 1 }}><b>{c.first_name} {c.last_name}</b> <small className="sub">({c.relationship})</small><br /><small>{c.phone}{c.business_phone && ` · work ${c.business_phone}`}{c.address && ` · ${c.address}`}</small></span>
      <button type="button" aria-label={`Remove ${c.first_name} ${c.last_name}`} onClick={() => s.run(() => json("DELETE", "/api/account?contact=" + c.id), (r) => r.json().then((l: Contact[]) => { setList(l); setAdding(!l.length); }))}>Remove</button>
    </div>)}
    {adding ? <form className="card" style={{ display: "grid", gap: 10, padding: 16 }} onSubmit={(e) => { e.preventDefault(); s.run(() => json("POST", "/api/account", f), saved); }}>
      <div style={two}><label>First name<input required maxLength={80} value={f.first_name} onChange={set("first_name")} /></label><label>Last name<input required maxLength={80} value={f.last_name} onChange={set("last_name")} /></label></div>
      <div style={two}><label>Phone<input required type="tel" maxLength={30} value={f.phone} onChange={set("phone")} /></label>
        <label>Relationship to you<select required value={f.relationship} onChange={set("relationship")}><option value="">Choose…</option>{relationships.map((r) => <option key={r}>{r}</option>)}</select></label></div>
      <label>Address (optional)<input maxLength={300} value={f.address} onChange={set("address")} /></label>
      <label>Business phone (optional)<input type="tel" maxLength={30} value={f.business_phone} onChange={set("business_phone")} /></label>
      <div className="wz-row">{list.length > 0 && <button type="button" onClick={() => setAdding(false)}>Cancel</button>}<button disabled={s.busy}>{s.busy ? "Saving…" : "Save contact"}</button></div>
    </form> : <div><button type="button" onClick={() => setAdding(true)}>+ Add another contact</button></div>}
    <div className="wz-row"><button className="pri" disabled={!list.length || adding} onClick={next}>Next</button></div>
  </div>;
}

function DirectoryStep({ next }: { next: () => void }) {
  const s = useSend(), [on, setOn] = useState(true), [photo, setPhoto] = useState(""), [open, setOpen] = useState<string[]>([]), [working, setWorking] = useState(""), [looking, setLooking] = useState(""), [pm, setPm] = useState(""), [cam, setCam] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const upload = async (f?: File | Blob) => {
    if (!f) return;
    const file = f instanceof File ? f : new File([f], "camera.jpg", { type: "image/jpeg" }), big = fileTooLarge(file);
    if (big) return setPm(big);
    setPm("Uploading…");
    const fd = new FormData(); fd.set("file", file);
    const r = await sendUpload("/api/members/photo", fd);
    if (r?.ok) { setPhoto((await r.json()).url); setPm(""); } else setPm(r ? await r.text() : "Network error. Try again.");
  };
  useEffect(() => { // camera on while the preview is showing; always released when it closes
    if (!cam) return;
    let stream: MediaStream | undefined, dead = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }).then((m) => { if (dead) return m.getTracks().forEach((t) => t.stop()); stream = m; if (video.current) video.current.srcObject = m; }, () => { setPm("Couldn't open the camera. Allow camera access, or upload a photo instead."); setCam(false); });
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam]);
  const snap = () => { const v = video.current!, c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")!.drawImage(v, 0, 0); setCam(false); c.toBlob((b) => upload(b ?? undefined), "image/jpeg", 0.9); };
  // Saving the listing, then marking the wizard finished so it never reopens.
  const save = () => s.run(async () => { const r = await json("POST", "/api/members", { op: "saveSkills", optin: on, fields: on ? { open_to: open, working_on: working.trim() ? [working.trim()] : [], looking_for: looking.trim() ? [looking.trim()] : [] } : {} }); return r.ok ? json("POST", "/api/onboarding", { step: "welcome" }) : r; }, next);
  return <div style={{ display: "grid", gap: 12 }}>
    <h2 id="wz-h">Maker Directory</h2>
    <Notice kind="error">{s.err}</Notice>
    <label className="card wz-chk" style={{ padding: 14 }}>
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
      <span><strong>List me in the member directory.</strong> Other signed-in members who are listed too can see my photo, first name, last initial, bio and skills, and message me. They never see my email, phone or address unless I switch one on below.</span>
    </label>
    {on ? <>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {cam ? <video ref={video} autoPlay playsInline muted style={{ width: 160, height: 160, borderRadius: "50%", objectFit: "cover", background: "#000", transform: "scaleX(-1)" }} />
          : photo ? <img src={photo} alt="Your photo" width={80} height={80} style={{ borderRadius: "50%", objectFit: "cover" }} />
          : <span aria-hidden style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--line)", display: "grid", placeItems: "center", fontSize: 28 }}>📷</span>}
        <div style={{ display: "grid", gap: 6 }}>
          <b>Add a photo of yourself <small className="sub">(optional)</small></b>
          {cam ? <span className="wz-row"><button type="button" className="pri" onClick={snap}>Take photo</button><button type="button" onClick={() => setCam(false)}>Cancel</button></span>
            : <span className="wz-row" style={{ justifyContent: "flex-start" }}>
              <label style={{ cursor: "pointer", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 12px" }}>{photo ? "Change photo" : "Upload a photo"}<input type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
              {typeof navigator !== "undefined" && navigator.mediaDevices && <button type="button" onClick={() => { setPm(""); setCam(true); }}>Use camera</button>}
            </span>}
          {pm === "Uploading…" ? <small role="status">{pm}</small> : <Notice kind="error">{pm}</Notice>}
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend><b>What are you here for?</b> <small className="sub">Tick anything you'd enjoy.</small></legend>
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", marginTop: 6 }}>
          {OPEN_TO.map((o) => <label key={o} className="wz-chk"><input type="checkbox" checked={open.includes(o)} onChange={(e) => setOpen(e.target.checked ? [...open, o] : open.filter((x) => x !== o))} />{o}</label>)}
        </div></fieldset>
      <label>🔨 Currently working on<input maxLength={120} value={working} onChange={(e) => setWorking(e.target.value)} placeholder="e.g. A CNC-cut walnut bookshelf" /></label>
      <label>🔎 Looking for<input maxLength={120} value={looking} onChange={(e) => setLooking(e.target.value)} placeholder="e.g. Someone to teach me TIG welding" /></label>
    </> : <p className="sub">No problem, you're skipping the directory. You can list yourself any time from My profile.</p>}
    <div className="wz-row"><button className="pri" disabled={s.busy} onClick={save}>{s.busy ? "Saving…" : on ? "Finish" : "Skip and finish"}</button></div>
  </div>;
}
