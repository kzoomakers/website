"use client";
// Pronouns, stored as one text value, kept apart from gender (never inferred from it). he/him and she/her are stored as-is.
// "Other" opens a multi-select of chips (order of picking is kept, so the first pick reads as the main one) and a short free-text box. Stored as "they/he, xe/xem".
// Custom text is shown as typed: nothing generates grammar from it (notifications should fall back to "they").
export const PRONOUN_CHIPS = ["he/him", "she/her", "they/them", "he/they", "she/they", "ze/zir", "xe/xem", "fae/faer", "it/its", "any/all", "ask me", "none / use name"] as const;
const MAIN = ["he/him", "she/her"], clean = (s: string) => s.replace(/,/g, " ").slice(0, 30);

function split(v: string) {
  if (!v) return { main: "", chips: [] as string[], own: "" };
  if (MAIN.includes(v)) return { main: v, chips: [], own: "" };
  const t = v.split(", ").filter(Boolean);
  return { main: "Other", chips: t.filter((x) => (PRONOUN_CHIPS as readonly string[]).includes(x)), own: t.filter((x) => !(PRONOUN_CHIPS as readonly string[]).includes(x)).join(" ") };
}
const join = (chips: string[], own: string) => [...chips, clean(own).trim()].filter(Boolean).join(", ");

export default function PronounSelect({ value, onChange, label = "Pronouns" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { main, chips, own } = split(value);
  // "Other" with nothing picked yet has no value of its own, so remember it locally via a sentinel the parent never sees.
  const pick = (m: string) => onChange(m === "Other" ? (main === "Other" ? value : "Other") : m);
  const shown = value === "Other" ? { main: "Other", chips: [], own: "" } : { main, chips, own };
  const toggle = (c: string) => onChange(join(shown.chips.includes(c) ? shown.chips.filter((x) => x !== c) : [...shown.chips, c], shown.own) || "Other");
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 4 }}>{label}
        <select value={shown.main} onChange={(e) => pick(e.target.value)} style={{ width: "100%" }}>
          <option value="">Choose…</option>
          {MAIN.map((g) => <option key={g}>{g}</option>)}
          <option>Other</option>
        </select>
      </label>
      {shown.main === "Other" && <>
        <div role="group" aria-label="Pick all that apply" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRONOUN_CHIPS.map((c) => { const on = shown.chips.includes(c); return <button key={c} type="button" aria-pressed={on} onClick={() => toggle(c)} style={{ borderRadius: 999, padding: "4px 12px", fontWeight: on ? 700 : 400, borderColor: on ? "var(--acc, #2f6fed)" : undefined, background: on ? "var(--acc-bg, #e8effe)" : undefined, color: on ? "var(--acc, #2f6fed)" : undefined }}>{on ? "✓ " : ""}{c}</button>; })}
        </div>
        <label style={{ display: "grid", gap: 4 }}>Something else? <small style={{ fontWeight: 400 }}>(optional, up to 30 characters)</small>
          <input maxLength={30} value={shown.own} placeholder="e.g. e/em" onChange={(e) => onChange(join(shown.chips, e.target.value) || "Other")} style={{ width: "100%" }} />
        </label>
      </>}
    </div>
  );
}
