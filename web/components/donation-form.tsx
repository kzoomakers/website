"use client";
import { useState } from "react";
import { CSS } from "./contact-form";

const CATS = ["Hand tools", "Power tools (portable)", "Power tools (stationary / shop machines)", "Woodworking", "Metalworking & welding", "Machining (lathes, mills)", "Electronics & soldering", "3D printing & laser / CNC", "Textiles & sewing", "Measuring & inspection", "Safety & PPE", "Clamps, storage & workholding", "Software / CAD", "Materials & consumables", "Other"];
const VALUES = ["Under $100", "$100 – $500", "$500 – $1,000", "$1,000 – $5,000", "$5,000 – $10,000", "Over $10,000", "Not sure"];
const COND = ["Like new", "Good, working", "Needs minor repair", "For parts or repair", "Mixed"];
const HOW = ["I can drop it off", "We need to pick it up", "Not sure yet"];

// Donation offer form for the donate page. Sent as kind "donation" to contact@ and kept in admin Messages → Donations.
export function DonationForm() {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [done, setDone] = useState(false);
  const go = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setErr("");
    const f = new FormData(e.currentTarget), g = (k: string) => String(f.get(k) ?? "").trim(), cats = f.getAll("cat").map(String);
    if (!cats.length) return setErr("Please pick at least one category.");
    const message = [`Categories: ${cats.join(", ")}`, `Items: ${g("items")}`, `Quantity: ${g("qty") || "—"}`, `Approximate total value: ${g("value")}`, `Condition: ${g("cond")}`, `Delivery: ${g("how")}`,
      `Tax receipt wanted: ${f.get("receipt") ? "yes" : "no"}`, `Phone: ${g("phone") || "—"}`, g("notes") && `\nNotes: ${g("notes")}`].filter(Boolean).join("\n");
    setBusy(true);
    const r = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "donation", name: g("name"), email: g("email"), subject: `Donation offer: ${cats.slice(0, 2).join(", ")}${cats.length > 2 ? "…" : ""} (${g("value")})`, message, website: g("website") }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(true); else setErr(r ? await r.text() : "Couldn't reach the server. Please try again.");
  };
  const sel = (name: string, opts: string[]) => <select name={name} required defaultValue="" style={{ display: "block", width: "100%", marginTop: 6, padding: "11px 13px", border: "1px solid #d5d9de", borderRadius: 8, font: "inherit", background: "#fafbfc" }}><option value="" disabled>Choose…</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  return (
    <section id="donate-form" style={{ padding: "20px 16px 40px" }}>
      <style>{CSS}</style>
      <div className="cf">
        {done ? (
          <div className="cf-ok" role="status"><span aria-hidden>✓</span><h3>Thank you!</h3><p className="cf-sub" style={{ margin: 0 }}>We received your donation offer and will email you to arrange the next step.</p></div>
        ) : (
          <form onSubmit={go}>
            <h3>Offer a donation</h3>
            <p className="cf-sub">Tell us what you'd like to donate. We're a 501(c)(3) nonprofit and track donations for our records and tax receipts.</p>
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
              <legend style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>What kinds of tools? <small>(pick all that apply)</small></legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: "6px 14px", marginTop: 8 }}>
                {CATS.map((c) => <label key={c} style={{ display: "flex", gap: 8, alignItems: "center", margin: 0, fontWeight: 400 }}><input type="checkbox" name="cat" value={c} style={{ width: "auto", margin: 0 }} />{c}</label>)}
              </div>
            </fieldset>
            <label>Describe the items <small>(brands, models, anything helpful)</small><textarea name="items" required minLength={10} maxLength={1500} /></label>
            <div className="cf-row">
              <label>Approximate number of items<input name="qty" maxLength={40} /></label>
              <label>Approximate total value{sel("value", VALUES)}</label>
              <label>Condition{sel("cond", COND)}</label>
              <label>Delivery{sel("how", HOW)}</label>
            </div>
            <div className="cf-row">
              <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>
              <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
              <label>Phone <small>(optional)</small><input name="phone" maxLength={40} autoComplete="tel" /></label>
            </div>
            <label>Anything else? <small>(optional)</small><textarea name="notes" maxLength={800} style={{ minHeight: 80 }} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="receipt" style={{ width: "auto", margin: 0 }} />I'd like a donation receipt for tax purposes</label>
            <div className="cf-hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            {err && <p className="cf-err" role="alert">{err}</p>}
            <div className="cf-foot"><span /><button className="btn btn-main" disabled={busy}>{busy ? "Sending…" : "Send donation offer"}</button></div>
          </form>
        )}
      </div>
    </section>
  );
}
