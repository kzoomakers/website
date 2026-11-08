"use client";
import { useState } from "react";
import type { Contact, Profile as P } from "@/lib/profiles";

const send = (method: string, body?: unknown, q = "") => fetch("/api/account" + q, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const pwPut = (body: unknown) => fetch("/api/blog/auth", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const grid = { display: "grid", gap: 10 } as const;
const EMPTY = { first_name: "", last_name: "", phone: "", relationship: "", address: "", business_phone: "" };

function ContactForm({ init, relationships, onSaved, onCancel }: { init: Partial<Contact>; relationships: string[]; onSaved: (c: Contact[]) => void; onCancel?: () => void }) {
  const [f, setF] = useState({ ...EMPTY, ...init }), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form style={grid} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr("");
      const r = await send("POST", { ...f, id: init.id }).catch(() => null);
      setBusy(false);
      if (r?.ok) onSaved(await r.json()); else setErr(r ? await r.text() : "Network error. Try again.");
    }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label>First name *<input required maxLength={80} value={f.first_name} onChange={set("first_name")} /></label>
        <label>Last name *<input required maxLength={80} value={f.last_name} onChange={set("last_name")} /></label>
      </div>
      <label>Phone *<input required type="tel" maxLength={30} autoComplete="off" value={f.phone} onChange={set("phone")} /></label>
      <label>Relationship to you *
        <select required value={f.relationship} onChange={set("relationship")}><option value="">Choose…</option>{relationships.map((r) => <option key={r}>{r}</option>)}</select>
      </label>
      <label>Address (optional)<input maxLength={300} value={f.address} onChange={set("address")} /></label>
      <label>Business phone (optional)<input type="tel" maxLength={30} value={f.business_phone} onChange={set("business_phone")} /></label>
      {err && <p role="alert" style={{ color: "#b00020", margin: 0 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}><button className="btn btn-main" type="submit" disabled={busy}>{init.id ? "Save contact" : "Add contact"}</button>{onCancel && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}

// A member's own page: their details, emergency contacts (at least one is asked for at first sign-in), and password.
export default function Profile({ profile, contacts: c0, relationships, next, setup, reset }: { profile: P; contacts: Contact[]; relationships: string[]; next: string; setup: boolean; reset: boolean }) {
  const [p, setP] = useState(profile), [contacts, setContacts] = useState(c0), [edit, setEdit] = useState<number | "new" | null>(null);
  const [m1, setM1] = useState(""), [m2, setM2] = useState(""), [cur, setCur] = useState(""), [pw, setPw] = useState(""), [has, setHas] = useState(profile.has_password && !reset), [busy, setBusy] = useState(false);
  const f = (k: keyof P) => ({ value: String(p[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value }) });
  const [saved, setSaved] = useState(profile), need = !contacts.length, thin = !saved.phone || !saved.address1, done = !need && !thin;
  return (
    <div style={{ display: "grid", gap: 36, maxWidth: 520 }}>
      {setup && !done && <p role="status" style={{ background: "#fff4d6", color: "#4a3500", padding: "10px 14px", borderRadius: 8, margin: 0 }}>Welcome! Two quick things before you start: {thin ? "your phone number and address" : ""}{thin && need ? ", and " : ""}{need ? "an emergency contact (someone we can call if something happens while you're at the space)" : ""}. It takes about a minute.</p>}
      {!setup && need && <p role="status" style={{ background: "#fff4d6", color: "#4a3500", padding: "10px 14px", borderRadius: 8, margin: 0 }}>Please add an emergency contact: someone we can call if something happens while you're at the space.</p>}
      {reset && <p role="status" style={{ background: "#e6f4ea", color: "#14532d", padding: "10px 14px", borderRadius: 8, margin: 0 }}>Your password was reset. Choose a new one below.</p>}

      <section style={grid}>
        <h2>Emergency contacts</h2>
        {contacts.map((k) => edit === k.id ? (
          <ContactForm key={k.id} init={k} relationships={relationships} onCancel={() => setEdit(null)} onSaved={(l) => { setContacts(l); setEdit(null); }} />
        ) : (
          <div key={k.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: "10px 14px" }}>
            <strong>{k.first_name} {k.last_name}</strong> <small>({k.relationship})</small><br />
            <a href={`tel:${k.phone}`}>{k.phone}</a>{k.business_phone && <> · work <a href={`tel:${k.business_phone}`}>{k.business_phone}</a></>}
            {k.address && <><br /><small>{k.address}</small></>}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className="btn btn-sm" onClick={() => setEdit(k.id)}>Edit</button>
              <button className="btn btn-sm" onClick={async () => { const r = await send("DELETE", undefined, `?contact=${k.id}`); if (r.ok) setContacts(await r.json()); }}>Remove</button>
            </div>
          </div>
        ))}
        {edit === "new" || (need && edit === null)
          ? <ContactForm init={{}} relationships={relationships} onCancel={need ? undefined : () => setEdit(null)} onSaved={(l) => { setContacts(l); setEdit(null); }} />
          : <div><button className="btn btn-sm" onClick={() => setEdit("new")}>+ Add another contact</button></div>}
        
      </section>

      <form style={grid} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setM1("");
        const r = await send("PUT", p).catch(() => null);
        setBusy(false); if (r?.ok) setSaved(p); setM1(r?.ok ? "Saved." : r ? await r.text() : "Network error. Try again.");
      }}>
        <h2>Your details</h2>
        <label>Email<input value={p.email} disabled /></label>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label>First name<input required maxLength={80} {...f("first_name")} /></label>
          <label>Last name<input maxLength={80} {...f("last_name")} /></label>
        </div>
        <label>Phone{setup ? " *" : ""}<input type="tel" required={setup} maxLength={30} autoComplete="tel" {...f("phone")} /></label>
        <label>Address{setup ? " *" : ""}<input required={setup} maxLength={120} autoComplete="address-line1" {...f("address1")} /></label>
        <label>Address line 2<input maxLength={120} autoComplete="address-line2" {...f("address2")} /></label>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr 1fr" }}>
          <label>City<input maxLength={120} {...f("city")} /></label>
          <label>State<input maxLength={120} {...f("state")} /></label>
          <label>ZIP<input maxLength={120} {...f("zip")} /></label>
        </div>
        <button className="btn btn-main" type="submit" disabled={busy}>Save details</button>
        {m1 && <p role="status" style={{ margin: 0 }}>{m1}</p>}
        {setup && done && <a className="btn btn-main" href={next}>All set: continue</a>}
      </form>

      <form style={grid} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setM2("");
        const r = await pwPut({ password: pw, current: cur }).catch(() => null);
        setBusy(false);
        if (r?.ok) { setPw(""); setCur(""); setHas(true); setM2("Password saved."); } else setM2(r ? await r.text() : "Network error. Try again.");
      }}>
        <h2>{has ? "Change password" : "Set a password"}</h2>
        {!has && <small style={{ opacity: 0.75 }}>Optional. Without one you sign in with an emailed link.</small>}
        {has && <label>Current password<input type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>}
        <label>New password (at least 10 characters)<input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <button className="btn btn-main" type="submit" disabled={busy}>{has ? "Change password" : "Save password"}</button>
        {m2 && <p role="status" style={{ margin: 0 }}>{m2}</p>}
      </form>
    </div>
  );
}
