"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/dialog";
import Extras from "./extras";
import IdPhoto from "./id-photo";
import RosterPhoto from "./roster-photo";
import GenderSelect from "@/components/gender-select";
import PronounSelect from "@/components/pronoun-select";
import DisableButton from "../../../disable-button";
import PiiButton from "@/components/pii-retrieve";
import JsonDownload from "@/components/pii-json";
import type { Profile } from "@/lib/profiles";
import "./person.css";

const call = (id: number, method: string, body?: unknown) =>
  fetch(`/api/webmaster/users/${id}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

type F = [keyof Profile, string];
const WHO: F[] = [["first_name", "First name"], ["last_name", "Last name"], ["email", "Email"]];
const PRIV: F[] = [["phone", "Phone"], ["address1", "Address"], ["address2", "Address line 2"], ["city", "City"], ["state", "State"], ["zip", "ZIP"]];
const IDS: F[] = [["access_card_number", "Access card number"], ["qb_id", "QuickBooks ID"]];

// Hidden fields are left out of a save, so saving can't blank them.
const PRIVATE = ["phone", "address1", "address2", "city", "state", "zip"]; // hidden until "Retrieve info" (logged)

// One member: every detail an admin can fix, their emergency contacts (hidden until retrieved), and account actions.
export default function Member({ profile, canEdit, roster }: { profile: Profile; canEdit: boolean; roster: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(profile), [base, setBase] = useState(profile), [shown, setShown] = useState(false), [pw, setPw] = useState(""), [msg, setMsg] = useState(""), [bad, setBad] = useState(false), [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Response>, ok: string, then?: () => void) => {
    setBusy(true); setMsg("");
    const r = await fn().catch(() => null);
    setBusy(false);
    setBad(!r?.ok); setMsg(r?.ok ? ok : r ? await r.text() : "Network error. Try again.");
    if (r?.ok) then?.();
  };
  const field = ([k, label]: F) => PRIVATE.includes(k) && !shown
    ? <label key={k}>{label}<input value="••••••••" readOnly disabled aria-label={`${label} (hidden)`} /></label>
    : <label key={k}>{label}<input type={k === "email" ? "email" : "text"} required={k === "first_name" || k === "email"} value={String(p[k] ?? "")} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></label>;
  const dirty = [...WHO, ["gender"] as any, ["pronouns"] as any, ...IDS, ...(shown ? PRIV : []), ["notes"] as any].some(([k]: [keyof Profile]) => p[k] !== base[k]);
  const initials = ((p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "") || p.name?.[0] || "?").toUpperCase();
  return (
    <>
      <Link href="/admin/people" className="pp-back">← People</Link>
      <header className="pp-hero">
        <div className="pp-hero-in">
          <div className="pp-av" aria-hidden>{initials}</div>
          <div className="pp-id">
            <h1>{p.name}{p.pronouns && p.pronouns !== "Other" && <small className="pp-pron">{p.pronouns}</small>}</h1>
            <p>{p.email} · joined {new Date(profile.created_at).toLocaleDateString([], { dateStyle: "medium" })}</p>
            <div className="pp-chips">
              {p.disabled ? <span className="chip bad">● Disabled</span> : <span className="chip ok">● Active</span>}
              <span className={"chip " + (profile.verified ? "ok" : "warn")}>{profile.verified ? "✓ Email verified" : "Email not verified"}</span>
              <span className="chip">{profile.has_password ? "🔑 Has a password" : "✉ Signs in by emailed link"}</span>
            </div>
          </div>
          <RosterPhoto id={p.id} name={p.name} initial={roster} canEdit={canEdit} />
          <div className="pp-quick"><a href={`mailto:${p.email}`}>✉ Email</a>{shown && p.phone && <a href={`tel:${p.phone}`}>📞 Call</a>}</div>
        </div>
      </header>
      {p.disabled && <p role="status" className="pp-alert">This account is disabled. They are told: “{p.disabled_reason || "Account is disabled"}”</p>}
      {msg && <p role={bad ? "alert" : "status"} style={{ color: bad ? "var(--bad)" : "var(--ok)", margin: "0 0 16px" }}>{msg}</p>}

      <div className="pp-cols">
        <div className="pp-main">
          <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <form className="pp-sec" onSubmit={(e) => { e.preventDefault(); run(() => call(p.id, "PUT", shown ? p : Object.fromEntries(Object.entries(p).filter(([k]) => !PRIVATE.includes(k)))), "Saved.", () => { setBase(p); router.refresh(); }); }}>
              <h2>Contact</h2>
              <div className="pp-grid">{WHO.map(field)}<div className="pp-gender"><GenderSelect value={p.gender ?? ""} onChange={(v) => setP({ ...p, gender: v })} /></div><div className="pp-gender"><PronounSelect value={p.pronouns ?? ""} onChange={(v) => setP({ ...p, pronouns: v })} /></div></div>
              <div className="pp-priv">
                <div className="pp-priv-h"><b>🔒 Phone &amp; address</b><PiiButton kind="personal" subject={{ type: "member", id: p.id }} label="Retrieve info" onChange={(d) => { setShown(!!d); const v = Object.fromEntries(PRIVATE.map((k) => [k, d?.[k] ?? ""])); setP((x) => ({ ...x, ...v })); setBase((x) => ({ ...x, ...v })); }}>{() => <span className="chip ok">Showing</span>}</PiiButton></div>
                {!shown && <p className="sub" style={{ margin: "0 0 12px" }}>Hidden. Retrieving asks for a reason and is logged.</p>}
                <div className="pp-grid">{PRIV.map(field)}</div>
              </div>
              <h2 style={{ marginTop: 22 }}>Identifiers</h2>
              <div className="pp-grid">{IDS.map(field)}</div>
              <h2 style={{ marginTop: 22 }}>Admin notes</h2>
              <label>Only admins see this<textarea rows={3} maxLength={2000} value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} /></label>
              {dirty && canEdit && <div className="pp-save" role="status"><span>You have unsaved changes</span><span style={{ display: "flex", gap: 8 }}><button type="button" disabled={busy} onClick={() => setP(base)}>Discard</button><button className="pri" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></span></div>}
            </form>
          </fieldset>

          <Extras id={p.id} canEdit={canEdit} />

          <h2>Training record</h2>
          <div className="pp-sec">
            <PiiButton kind="training" subject={{ type: "member", id: p.id }} label="Retrieve training record">{(d) => <JsonDownload data={d} name={`training-${p.id}.json`} label="Download training record (JSON)" />}</PiiButton>
          </div>

          <h2>Emergency contacts</h2>
          <div className="pp-sec">
            <PiiButton kind="emergency" subject={{ type: "member", id: p.id }} label="Retrieve emergency contacts">{(d) => <>
              {d.contacts.map((k: any) => (
                <div className="pp-ec" key={k.id}>
                  <strong>{k.first_name} {k.last_name}</strong> <span className="chip">{k.relationship}</span><br />
                  <a href={`tel:${k.phone}`}>{k.phone}</a>{k.business_phone && <> · work <a href={`tel:${k.business_phone}`}>{k.business_phone}</a></>}
                  {k.address && <div className="sub" style={{ margin: 0 }}>{k.address}</div>}
                </div>
              ))}
              {!d.contacts.length && <p className="sub">None on file. {profile.name} is asked to add one the next time they sign in.</p>}
            </>}</PiiButton>
          </div>
        </div>

        <aside className="pp-side">
          <section className="pp-sec"><h2>Gov ID</h2><IdPhoto id={p.id} /></section>
          {canEdit && (
            <section className="pp-sec"><h2>Account</h2>
              <div className="pp-acts">
                <button disabled={busy} onClick={async () => { if (await confirmDialog(`Email a password reset link to ${profile.email}? Their current password stops working when they click it.`, { ok: "Send" })) run(() => call(p.id, "POST", { action: "sendReset" }), "Reset email sent."); }}>✉ Send password reset email</button>
                <form onSubmit={(e) => { e.preventDefault(); run(() => call(p.id, "POST", { action: "setPassword", password: pw }), "Password set. Tell them the new password.", () => setPw("")); }}>
                  <input type="password" autoComplete="new-password" minLength={10} required placeholder="New password (10+ characters)" aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
                  <button disabled={busy}>🔑 Set password</button>
                </form>
                <DisableButton id={p.id} name={p.name} disabled={p.disabled} onChange={(d, reason) => { setP({ ...p, disabled: d, disabled_reason: d ? reason : "" }); router.refresh(); }} />
              </div>
            </section>
          )}
          {canEdit && (
            <section className="pp-sec pp-danger"><h2>Danger zone</h2>
              <button disabled={busy} style={{ color: "var(--bad)", width: "100%" }} onClick={async () => {
                if (await confirmDialog(`Delete ${profile.name} (${profile.email})? This removes their account, comments, emergency contacts and access, and can't be undone.`, { ok: "Delete", danger: true }))
                  run(() => call(p.id, "DELETE"), "Deleted.", () => router.push("/admin/people"));
              }}>Delete this person…</button>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
