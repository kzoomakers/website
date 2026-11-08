// Pure helpers (safe in the browser): compare two waiver versions section by section, and word by word inside changed sections.
export type Section = { heading: string; body: string };
export type Version = { id: number; revision: string; title: string; sections: Section[]; closing: string; summary: string; mandatory: boolean; created_by: string; created_at: string };
export type Word = { t: "+" | "-" | " "; s: string };
export type Change = { kind: "added" | "removed" | "changed"; heading: string; words?: Word[]; body?: string };

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tok = (s: string) => s.split(/(\s+)/).filter(Boolean);

// shortcut: O(n*m) LCS over words; sections are a few hundred words, so this is instant. Use Myers if sections ever get huge.
export function wordDiff(a: string, b: string): Word[] {
  const x = tok(a), y = tok(b), L = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Word[] = [];
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { out.push({ t: " ", s: x[i] }); i++; j++; }
    else if (j < y.length && (i === x.length || L[i][j + 1] >= L[i + 1][j])) out.push({ t: "+", s: y[j++] });
    else out.push({ t: "-", s: x[i++] });
  }
  return out;
}

/** Sections that were added, removed, or edited going from `a` to `b` (matched by heading). Wording of the closing statement counts too. */
export function diffVersions(a: Pick<Version, "sections" | "closing">, b: Pick<Version, "sections" | "closing">): Change[] {
  const old = new Map(a.sections.map((s) => [norm(s.heading), s])), seen = new Set<string>(), out: Change[] = [];
  for (const s of b.sections) {
    const k = norm(s.heading), o = old.get(k);
    seen.add(k);
    if (!o) out.push({ kind: "added", heading: s.heading, body: s.body });
    else if (o.body.trim() !== s.body.trim() || o.heading !== s.heading) out.push({ kind: "changed", heading: s.heading, words: wordDiff(o.body.trim(), s.body.trim()) });
  }
  for (const s of a.sections) if (!seen.has(norm(s.heading))) out.push({ kind: "removed", heading: s.heading, body: s.body });
  if (a.closing.trim() !== b.closing.trim()) out.push({ kind: "changed", heading: "Closing statement", words: wordDiff(a.closing.trim(), b.closing.trim()) });
  return out;
}

/** One plain sentence: "2 sections changed, 1 added, 1 removed (Fees, Guests…)". */
export function summarize(ch: Change[]) {
  if (!ch.length) return "No wording changed.";
  const n = (k: Change["kind"]) => ch.filter((c) => c.kind === k).length;
  const parts = (["changed", "added", "removed"] as const).filter(n).map((k) => `${n(k)} ${k === "changed" ? "edited" : k}`);
  return `${parts.join(", ")}: ${ch.slice(0, 6).map((c) => c.heading.toLowerCase()).join("; ")}${ch.length > 6 ? "…" : ""}.`;
}

/** The whole agreement as plain text (what gets stored on each signed copy). */
export const fullText = (v: Pick<Version, "title" | "revision" | "sections" | "closing">) =>
  `${v.title}\nRevision ${v.revision}\n\n${v.sections.map((s) => `${s.heading}: ${s.body}`).join("\n\n")}\n\n${v.closing}`;

/** The changes as plain text for an AI to explain: what each section said before and after. Throws if it is too long to send. */
export function changesPrompt(ch: Change[]) {
  const out = ch.map((c) => c.kind === "changed"
    ? `EDITED "${c.heading}"\nBEFORE: ${c.words!.filter((w) => w.t !== "+").map((w) => w.s).join("")}\nAFTER: ${c.words!.filter((w) => w.t !== "-").map((w) => w.s).join("")}`
    : `${c.kind === "added" ? "NEW" : "REMOVED"} SECTION "${c.heading}": ${c.body}`).join("\n\n");
  if (out.length > 60000) throw new Error("The changes are too long to summarize in one go. Summarize it yourself, or publish in smaller steps.");
  return out;
}
