"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import Notice from "@/components/notice";
import SignPad from "@/components/sign-pad";
import { Agreement } from "@/components/agreement";
import type { Version } from "@/lib/waiver-diff";
import type { Guest } from "@/lib/guests";
import { EmergencyStep, IdStep, Stepper, WZ_CSS, json, two, useSend } from "./wizard";

// The New Guest wizard: the same look and steps as the member welcome wizard (wizard.tsx), for a guest. The host runs it on their device, or the guest runs it on their own phone
// through a private link (`token`). Progress is saved at every step, and Cancel keeps what was entered: the guest simply shows as INCOMPLETE and resumes at the first unfinished step.
type Screen = "start" | "details" | "emergency" | "agreement" | "photo" | "done";
type Info = { guest: Guest; host: boolean; retention_years: number; relationships: string[]; kinds: Record<string, string>; upload_mb: number; version: Version | null };
const HOST_STEPS = [["start", "Start"], ["details", "Details"], ["emergency", "Emergency contacts"], ["agreement", "Agreement"], ["photo", "Photo ID"]] as const;
const GUEST_STEPS = HOST_STEPS.slice(1);
const GCSS = `dialog.wz.gz{width:min(820px,calc(100% - 24px))}
@media(max-width:700px){dialog.wz.gz{width:100%;max-width:100%;height:100dvh;max-height:100dvh;border-radius:0}.gz .wz-row button{min-height:46px;flex:1 1 140px}.gz input,.gz select{min-height:44px;font-size:16px}}
.gz-qr{display:grid;justify-items:center;gap:8px}.gz-qr img{width:min(260px,70vw);height:auto;image-rendering:pixelated;background:#fff;padding:10px;border-radius:10px}`;

export default function GuestWizard({ id, token, resume, onClose }: { id?: number; token?: string; resume?: boolean; onClose: () => void }) {
  const q = token ? "t=" + encodeURIComponent(token) : "g=" + id;
  const [info, setInfo] = useState<Info | null>(null), [screen, setScreen] = useState<Screen | null>(null), [err, setErr] = useState(""), [saved, setSaved] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const steps = token ? GUEST_STEPS : HOST_STEPS;

  const load = useCallback(async () => {
    const r = await fetch("/api/guests?" + q, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) { setErr(r ? await r.text() : "Couldn't reach the server. Check your connection and try again."); return null; }
    const j: Info = await r.json(); setInfo(j); return j;
  }, [q]);
  useEffect(() => { load().then((j) => j && setScreen((cur) => cur ?? (token || resume ? (j.guest.next ?? "done") : "start"))); }, [load, token, resume]);
  useEffect(() => { if (screen && !dlg.current?.open) dlg.current?.showModal(); }, [screen]);

  const advance = async () => { const j = await load(); if (j) { setErr(""); setScreen(j.guest.next ?? "done"); dlg.current?.scrollTo(0, 0); } };
  // Cancel: everything entered is already saved (the details step saves what it has first), so just leave. A guest on their own phone is told how to come back.
  const cancel = () => (token ? setSaved(true) : onClose());
  const Cancel = () => <div className="wz-row"><button type="button" onClick={cancel}>Cancel (save and finish later)</button></div>;

  if (!screen) return err ? <dialog ref={dlg} className="wz gz" open><style>{WZ_CSS}</style><div className="wz-body"><Notice kind="error">{err}</Notice>{!token && <div className="wz-row"><button onClick={onClose}>Close</button></div>}</div></dialog> : null;
  const at = steps.findIndex(([s]) => s === screen), g = info?.guest;
  return (
    <dialog ref={dlg} className="wz gz" aria-labelledby="wz-h" onCancel={(e) => e.preventDefault()}>
      <style>{WZ_CSS + GCSS}</style>
      <Stepper steps={steps} at={screen === "done" ? steps.length : at} />
      <div className="wz-body">
        <Notice kind="error">{err}</Notice>
        {saved ? <>
          <h2 id="wz-h">Saved</h2>
          <p>Your progress is saved. To pick up where you left off, scan the QR code again, or open the link you were sent.</p>
          <div className="wz-row"><button className="pri" onClick={() => setSaved(false)}>Keep going</button></div>
        </> : info && g && <>
          {screen === "start" && <StartStep id={id!} q={q} g={g} next={advance} cancel={cancel} />}
          {screen === "details" && <DetailsStep q={q} g={g} next={advance} cancel={(v) => fetch("/api/guests?" + q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "partial", ...v }) }).finally(cancel)} />}
          {screen === "emergency" && <><EmergencyStep relationships={info.relationships} next={advance} api={`/api/guests/contacts?${q}`} who={g.first_name || "the guest"} /><Cancel /></>}
          {screen === "agreement" && info.version && <AgreementStep q={q} g={g} version={info.version} years={info.retention_years} next={advance} cancel={cancel} />}
          {screen === "photo" && <><IdStep guest kinds={info.kinds} mb={info.upload_mb} url={`/api/guests/photo?${q}`} next={advance} /><Cancel /></>}
          {screen === "done" && <>
            <h2 id="wz-h">{g.ready ? `${g.first_name} is all set` : "Almost there"}</h2>
            <p>{token ? "Thank you! Everything is on file. You can close this page." : g.ready ? "Everything is on file. You can check them in from the guest list." : "Some steps are still open. Pick the guest in the list to continue."}</p>
            {g.ever_signed && <p><a href={`/api/guests/pdf?${q}`}>Download the signed agreement (PDF)</a></p>}
            {!token && <div className="wz-row"><button className="pri" onClick={onClose}>Back to my guests</button></div>}
          </>}
        </>}
      </div>
    </dialog>
  );
}

function EmailLink({ id }: { id: number }) {
  const s = useSend(), [to, setTo] = useState(""), [done, setDone] = useState(false);
  return <form style={{ display: "grid", gap: 6 }} onSubmit={(e) => { e.preventDefault(); setDone(false); s.run(() => json("POST", "/api/guests", { op: "emailLink", g: id, to }), () => setDone(true)); }}>
    <label>Or email the link to the guest<input type="email" inputMode="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="guest@example.com" /></label>
    <Notice kind="error">{s.err}</Notice>
    <div className="wz-row" style={{ justifyContent: "flex-start" }}><button disabled={s.busy}>{s.busy ? "Sending…" : "Send link"}</button>{done && <small role="status">Sent.</small>}</div>
  </form>;
}

function StartStep({ id, q, g, next, cancel }: { id: number; q: string; g: Guest; next: () => void; cancel: () => void }) {
  const [url, setUrl] = useState(""), [qr, setQr] = useState(""), [err, setErr] = useState(""), [copied, setCopied] = useState(false), [live, setLive] = useState(g);
  const phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  useEffect(() => {
    fetch("/api/guests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "link", g: id }) }).then(async (r) => {
      if (!r.ok) return setErr(await r.text());
      const u = (await r.json()).url as string, c = qrcode(0, "M"); c.addData(u); c.make(); setUrl(u); setQr(c.createDataURL(6, 0));
    }).catch(() => setErr("Couldn't make the QR code. Check your connection."));
  }, [id]);
  // While the guest works on their phone, show where they are, so the host can carry on from the same place.
  useEffect(() => {
    const t = setInterval(() => document.hidden || fetch("/api/guests?" + q, { cache: "no-store" }).then((r) => r.json()).then((j) => setLive(j.guest)).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [q]);
  const label = { details: "their details", emergency: "emergency contacts", agreement: "the agreement", photo: "their photo ID" } as const;
  const msg = `Hi${g.first_name ? " " + g.first_name : ""}, please fill in your guest details for Kzoo Makers here (the link works for a few hours): ${url}`;
  return <>
    <h2 id="wz-h">New guest</h2>
    <p>Want the guest to complete this? Have them scan this QR code, otherwise click Next below to do it here:</p>
    <Notice kind="error">{err}</Notice>
    <div className="gz-qr">
      {qr ? <img src={qr} alt="QR code that opens the guest form on the guest's phone" /> : !err && <p role="status">Making the code…</p>}
      {live.next && live.next !== "details" || live.first_name ? <small className="sub" role="status">{live.ready ? "The guest has finished everything." : `The guest has started. They are up to ${label[live.next ?? "photo"]}.`}</small> : null}
    </div>
    {url && <div className="wz-row" style={{ justifyContent: "center" }}>
      {phone && <button type="button" onClick={() => { location.href = `sms:?&body=${encodeURIComponent(msg)}`; }}>Text the link</button>}
      {phone && <button type="button" onClick={() => { location.href = `mailto:?subject=${encodeURIComponent("Kzoo Makers guest form")}&body=${encodeURIComponent(msg)}`; }}>Email the link</button>}
      <button type="button" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
    </div>}
    <EmailLink id={id} />
    <div className="wz-row"><button type="button" onClick={cancel}>Cancel</button><button className="pri" onClick={next}>Next</button></div>
  </>;
}

function DetailsStep({ q, g, next, cancel }: { q: string; g: Guest; next: () => void; cancel: (v: Record<string, string>) => void }) {
  const s = useSend(), [f, setF] = useState<Record<string, string>>({ first_name: g.first_name, last_name: g.last_name, email: g.email, phone: g.phone, address: g.address, zip: g.zip, state: g.state });
  const i = (k: string, label: string, extra: object = {}) => <label>{label}<input required value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={200} {...extra} /></label>;
  return <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => { e.preventDefault(); s.run(() => json("POST", "/api/guests?" + q, { op: "details", ...f }), next); }}>
    <h2 id="wz-h">Guest details</h2>
    <Notice kind="error">{s.err}</Notice>
    <div style={two}>{i("first_name", "First name", { autoComplete: "given-name" })}{i("last_name", "Last name", { autoComplete: "family-name" })}</div>
    {i("email", "Email (the signed agreement is sent here)", { type: "email", inputMode: "email", autoComplete: "email" })}
    {i("phone", "Phone", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 30 })}
    {i("address", "Address", { autoComplete: "street-address" })}
    <div style={two}>{i("zip", "Zip code", { inputMode: "numeric", autoComplete: "postal-code", maxLength: 12 })}{i("state", "State", { autoComplete: "address-level1", maxLength: 40 })}</div>
    <div className="wz-row"><button type="button" onClick={() => cancel(f)}>Cancel (save and finish later)</button><button className="pri" disabled={s.busy}>{s.busy ? "Saving…" : "Next"}</button></div>
  </form>;
}

type Sig = { signature: string; initials: string; drawn: string };
function AgreementStep({ q, g, version, years, next, cancel }: { q: string; g: Guest; version: Version; years: number; next: () => void; cancel: () => void }) {
  const s = useSend(), [minor, setMinor] = useState<boolean | null>(g.minor), [ack, setAck] = useState(false), [first, setFirst] = useState<Sig | null>(null);
  const name = `${g.first_name} ${g.last_name}`.trim();
  const submit = (guest: Sig, guardian?: { signature: string; drawn: string }) =>
    s.run(() => json("POST", "/api/guests?" + q, { op: "sign", ...guest, minor: minor === true, ack, guardian }), next);
  return <div style={{ display: "grid", gap: 12 }}>
    <h2 id="wz-h">Guest agreement</h2>
    <p className="sub">Please read the whole agreement ({version.title}, revision {version.revision}) and sign at the bottom. A signed PDF is emailed to the guest and to {g.host_name.split(" ")[0] || "the host"}.</p>
    <Notice kind="error">{s.err}</Notice>
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
      <legend><b>Is the guest under 18?</b></legend>
      <label className="wz-chk"><input type="radio" name="minor" checked={minor === false} onChange={() => { setMinor(false); setFirst(null); }} />No</label>
      <label className="wz-chk"><input type="radio" name="minor" checked={minor === true} onChange={() => { setMinor(true); setFirst(null); }} />Yes, a minor</label>
      {minor && <Notice kind="info">A parent or legal guardian must be present to sign this agreement as well.</Notice>}
    </fieldset>
    <article className="wz-doc" tabIndex={0}><Agreement sections={version.sections} closing={version.closing} /></article>
    <label className="card wz-chk" style={{ padding: 12, alignItems: "flex-start" }}>
      <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
      <span>I understand and agree that my information, including my signed agreement, emergency contacts and photo ID, will be kept for at least {years} years after my last visit.</span>
    </label>
    {minor === null ? <p className="sub">Answer the question above to continue.</p>
      : !ack ? <p className="sub">Tick the box above before signing.</p>
      : minor && first ? <>
        <p><b>Parent or legal guardian:</b> please type your name and sign below.</p>
        <SignPad name="" busy={s.busy} drawRequired label="Guardian signs and finish" onSign={(signature, drawn) => submit(first, { signature, drawn })} />
        <div className="wz-row"><button type="button" onClick={() => setFirst(null)}>Back</button></div>
      </> : <SignPad name={name} busy={s.busy} initials drawRequired label={minor ? "Sign as the guest, then guardian signs" : "Sign and continue"}
        onSign={(signature, drawn, initials) => (minor ? setFirst({ signature, drawn, initials }) : submit({ signature, drawn, initials }))} />}
    <div className="wz-row"><button type="button" onClick={cancel}>Cancel (save and finish later)</button></div>
  </div>;
}
