"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/dialog";
import Extras from "./extras";
import DisableButton from "../../../disable-button";
import type { Contact, Profile } from "@/lib/profiles";

const call = (id: number, method: string, body?: unknown) =>
  fetch(`/api/webmaster/users/${id}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const FIELDS: [keyof Profile, string][] = [["first_name", "First name"], ["last_name", "Last name"], ["email", "Email"], ["phone", "Phone"], ["address1", "Address"], ["address2", "Address line 2"], ["city", "City"], ["state", "State"], ["zip", "ZIP"], ["access_card_number", "Access card number"], ["qb_id", "QuickBooks ID"]];

// One member: every detail an admin can fix, their emergency contacts (always visible here), and account actions.
export default function Member({ profile, contacts, canEdit }: { profile: Profile; contacts: Contact[]; canEdit: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(profile), [pw, setPw] = useState(""), [msg, setMsg] = useState(""), [bad, setBad] = useState(false), [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Response>, ok: string, then?: () => void) => {
    setBusy(true); setMsg("");
    const r = await fn().catch(() => null);
    setBusy(false);
    setBad(!r?.ok); setMsg(r?.ok ? ok : r ? await r.text() : "Network error. Try again.");
    if (r?.ok) then?.();
  };
  return (
    <>
      <p className="sub" style={{ margin: 0 }}><Link href="/admin/crm">← People</Link></p>
      <h1>{p.name}{p.disabled && <span className="tag" style={{ color: "var(--bad)" }}>Disabled</span>}</h1>
      <p className="sub">{profile.verified ? "Verified" : "Email not verified yet"} · {profile.has_password ? "has a password" : "signs in by emailed link"} · joined {new Date(profile.created_at).toLocaleDateString()}</p>
      {p.disabled && <p role="status" className="sub" style={{ background: "var(--acc-bg)", padding: "8px 12px", borderRadius: 8 }}>This account is disabled. They are told: “{p.disabled_reason || "Account is disabled"}”</p>}
      {msg && <p role={bad ? "alert" : "status"} style={{ color: bad ? "var(--bad)" : "var(--ok)" }}>{msg}</p>}

      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <form className="card" style={{ display: "grid", gap: 10, padding: 16 }} onSubmit={(e) => { e.preventDefault(); run(() => call(p.id, "PUT", p), "Saved.", () => router.refresh()); }}>
          <h2 style={{ margin: 0 }}>Details</h2>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            {FIELDS.map(([k, label]) => <label key={k}>{label}<input type={k === "email" ? "email" : "text"} required={k === "first_name" || k === "email"} value={String(p[k] ?? "")} onChange={(e) => setP({ ...p, [k]: e.target.value })} style={{ width: "100%" }} /></label>)}
          </div>
          <label>Notes (admins only)<textarea rows={3} maxLength={2000} value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} style={{ width: "100%" }} /></label>
          <div><button className="pri" type="submit" disabled={busy}>Save changes</button></div>
        </form>
      </fieldset>

      <Extras id={p.id} canEdit={canEdit} />

      <h2>Emergency contacts</h2>
      <div className="card">
        {contacts.map((k) => (
          <div className="row" key={k.id} style={{ display: "block" }}>
            <strong>{k.first_name} {k.last_name}</strong> <span className="tag">{k.relationship}</span><br />
            <a href={`tel:${k.phone}`}>{k.phone}</a>{k.business_phone && <> · work <a href={`tel:${k.business_phone}`}>{k.business_phone}</a></>}
            {k.address && <div className="sub" style={{ margin: 0 }}>{k.address}</div>}
          </div>
        ))}
        {!contacts.length && <p className="sub">None on file. {profile.name} is asked to add one the next time they sign in.</p>}
      </div>

      {canEdit && (
        <>
          <h2>Account</h2>
          <div className="card" style={{ display: "grid", gap: 12, padding: 16 }}>
            <div><button disabled={busy} onClick={async () => { if (await confirmDialog(`Email a password reset link to ${profile.email}? Their current password stops working when they click it.`, { ok: "Send" })) run(() => call(p.id, "POST", { action: "sendReset" }), "Reset email sent."); }}>Send password reset email</button></div>
            <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); run(() => call(p.id, "POST", { action: "setPassword", password: pw }), "Password set. Tell them the new password.", () => setPw("")); }}>
              <input type="password" autoComplete="new-password" minLength={10} required placeholder="New password (10+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} style={{ minWidth: 260 }} />
              <button disabled={busy}>Set password</button>
            </form>
            <div><DisableButton id={p.id} name={p.name} disabled={p.disabled} onChange={(d, reason) => { setP({ ...p, disabled: d, disabled_reason: d ? reason : "" }); router.refresh(); }} /></div>
            <div><button disabled={busy} style={{ color: "var(--bad)" }} onClick={async () => {
              if (await confirmDialog(`Delete ${profile.name} (${profile.email})? This removes their account, comments, emergency contacts and access, and can't be undone.`, { ok: "Delete", danger: true }))
                run(() => call(p.id, "DELETE"), "Deleted.", () => router.push("/admin/crm"));
            }}>Delete this person…</button></div>
          </div>
        </>
      )}
    </>
  );
}
