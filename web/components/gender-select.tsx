"use client";
// Gender, stored as one text value. Male / Female / Prefer not to say are stored as-is; "Other" opens a second, inclusive list plus a "describe" box.
// Anything stored that isn't in the lists (an older free-text answer) comes back as Other → "My own words".
export const GENDER_MAIN = ["Male", "Female", "Other", "Prefer not to say"] as const;
export const GENDER_OTHER = ["Non-binary", "Genderqueer", "Genderfluid", "Agender", "Bigender", "Demigender", "Trans man", "Trans woman", "Transmasculine", "Transfeminine", "Two-Spirit", "Intersex", "Questioning or exploring", "Not listed, I'll describe it"] as const;
const OWN = GENDER_OTHER[GENDER_OTHER.length - 1];

const split = (v: string) => (GENDER_MAIN as readonly string[]).includes(v) && v !== "Other" ? { main: v, sub: "", own: "" }
  : (GENDER_OTHER as readonly string[]).includes(v) && v !== OWN ? { main: "Other", sub: v, own: "" }
  : v ? { main: "Other", sub: OWN, own: v === "Other" ? "" : v } : { main: "", sub: "", own: "" };

export default function GenderSelect({ value, onChange, label = "Gender" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { main, sub, own } = split(value);
  const set = (m: string, s: string, o: string) => onChange(m === "Other" ? (s === OWN ? o.trim() === "" ? "Other" : o : s || "Other") : m);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 4 }}>{label}
        <select value={main} onChange={(e) => set(e.target.value, "", "")} style={{ width: "100%" }}>
          <option value="">Choose…</option>
          {GENDER_MAIN.map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
      {main === "Other" && <>
        <label style={{ display: "grid", gap: 4 }}>Which fits best?
          <select value={sub} onChange={(e) => set("Other", e.target.value, "")} style={{ width: "100%" }}>
            <option value="">Choose…</option>
            {GENDER_OTHER.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        {sub === OWN && <label style={{ display: "grid", gap: 4 }}>In your own words
          <input maxLength={80} value={own} placeholder="Type anything you like" onChange={(e) => set("Other", OWN, e.target.value)} style={{ width: "100%" }} />
        </label>}
      </>}
    </div>
  );
}
