// Profile facts that the member directory can search and filter by. Add a line to add a dimension (and an input in profile.tsx to edit it).
// kind: title = Title Case, letters/numbers/spaces/hyphens/periods only, and members pick from what others already entered (so it stays tidy);
//       plain = tidied spacing only; pick = fixed checkbox list (OPEN_TO); text = a free sentence, searchable but not a filter.
export const FIELDS = {
  occupation: { label: "Occupation", multi: false, kind: "title", max: 60 },
  company: { label: "Company", multi: false, kind: "plain", max: 60 },
  industry: { label: "Industry", multi: false, kind: "plain", max: 60 },
  city: { label: "City", multi: false, kind: "title", max: 60 },
  neighborhood: { label: "Neighborhood", multi: false, kind: "title", max: 60 },
  interests: { label: "Interests", multi: true, kind: "title", max: 60 },
  machine: { label: "Favorite machine or area", multi: true, kind: "title", max: 60 },
  open_to: { label: "Open to", multi: true, kind: "pick", max: 60 },
  pronouns: { label: "Pronouns", multi: false, kind: "text", max: 30 },
  working_on: { label: "Currently working on", multi: false, kind: "text", max: 120 },
  looking_for: { label: "Looking for", multi: false, kind: "text", max: 120 },
} as const;
export type FieldKey = keyof typeof FIELDS;
/** Fields the directory offers as a filter. */
export const isFacet = (k: string) => k in FIELDS && FIELDS[k as FieldKey].kind !== "text";

export const OPEN_TO = ["Mentoring others", "Being mentored", "Co-working buddy", "Project collaboration", "Teaching a class", "Grabbing coffee or lunch", "Open build nights", "Learning to give tours", "Maintaining equipment", "Grounds keeping", "Operate Classes/Workshops"];

/** "cnc  router!" -> "Cnc Router": only letters, numbers, spaces, hyphens and periods; each word capitalized; short all-caps words (CNC) and words with digits (3D) stay upper case. */
export function cleanTitle(s: string, max = 60): string {
  return s.replace(/[^\p{L}\p{N} .-]/gu, "").replace(/\s+/g, " ").replace(/^[ .-]+/, "").trim().slice(0, max).split(" ").map((w) => w.split("-").map((g) =>
    /\d/.test(g) || (g.length > 1 && g.length <= 5 && g === g.toUpperCase()) ? g.toUpperCase() : g.charAt(0).toUpperCase() + g.slice(1).toLowerCase()).join("-")).join(" ");
}
/** One stored value for a field, tidied the way its kind requires ("" = drop it). */
export function cleanField(k: FieldKey, v: unknown): string {
  const f = FIELDS[k], s = typeof v === "string" ? v : "";
  if (f.kind === "title") return cleanTitle(s, f.max);
  if (f.kind === "pick") return OPEN_TO.includes(s) ? s : "";
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, f.max);
}

// Links a member can share. We keep only the handle (or, for a website, a checked http(s) URL) and build the link ourselves, so a profile can never hold a javascript: link.
export const SOCIALS = {
  github: { label: "GitHub", prefix: "github.com/", ph: "username", host: /^(https?:\/\/)?(www\.)?github\.com\//i, ok: /^[a-z0-9-]{1,39}$/i },
  instagram: { label: "Instagram", prefix: "instagram.com/", ph: "handle", host: /^(https?:\/\/)?(www\.)?instagram\.com\//i, ok: /^[a-z0-9_.]{1,30}$/i },
  youtube: { label: "YouTube", prefix: "youtube.com/@", ph: "channel handle", host: /^(https?:\/\/)?(www\.)?youtube\.com\/(@)?/i, ok: /^[a-z0-9_.-]{1,60}$/i },
  website: { label: "Website", prefix: "", ph: "https://yoursite.com" },
} as const;
export type Socials = Partial<Record<keyof typeof SOCIALS, string>>;
export function cleanSocial(k: keyof typeof SOCIALS, v: unknown): string {
  let s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  if (k === "website") {
    try { const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.href.length > 200) throw 0; return u.href; } catch { throw new Error("Enter a website address like https://yoursite.com."); }
  }
  const f = SOCIALS[k as "github"];
  s = s.replace(f.host, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  if (!f.ok.test(s)) throw new Error(`That doesn't look like a ${f.label} ${f.ph}.`);
  return s;
}
export const socialHref = (k: keyof typeof SOCIALS, v: string) => (k === "website" ? v : `https://${SOCIALS[k].prefix}${v}`);
export type Fields = Record<string, string[]>;

// Offered in the profile's industry picker; anything else is typed under "Other" and is stored as typed.
export const INDUSTRIES = [
  "Arts & design", "Construction & trades", "Education", "Engineering", "Finance & insurance", "Food & hospitality", "Government & nonprofit",
  "Healthcare", "Manufacturing", "Real estate", "Retail", "Science & research", "Technology", "Transportation & logistics",
  "Student", "Retired", "Between jobs",
];
