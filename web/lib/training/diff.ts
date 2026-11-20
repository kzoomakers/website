import { createHash } from "crypto";
import { keyOf, type Q } from "./questions";

// Comparing and fingerprinting revisions. Pure.
export const SETTINGS = ["intro_html", "pass_pct", "time_limit_min", "max_attempts", "cooldown_hours", "shuffle_questions", "shuffle_choices", "pool_size", "review_mode", "grace_days"] as const;
export type Settings = Record<(typeof SETTINGS)[number], unknown>;
export type RevData = { settings: Settings; questions: (Q & { qkey: string })[] };

const canon = (v: any): string => (Array.isArray(v) ? `[${v.map(canon)}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}` : JSON.stringify(v ?? null));

/** Fingerprint of everything a member could be graded on; stored at publish and re-checked on read so a hand edit in the database shows. */
export const revisionHash = (r: RevData) =>
  createHash("sha256").update(canon({ s: Object.fromEntries(SETTINGS.map((k) => [k, r.settings[k] ?? null])), q: r.questions.map((q) => [q.qkey, q.type, q.prompt_html, q.points, q.required_correct, q.feedback_html, q.config]) })).digest("hex");

export type Diff = { settings: { key: string; from: unknown; to: unknown }[]; added: string[]; removed: string[]; changed: { qkey: string; label: string; fields: string[]; keyChanged: boolean }[]; moved: boolean; suggest: "major" | "minor" };
const plain = (q: Q) => q.prompt_html.replace(/<[^>]*>/g, "").trim().slice(0, 80) || "(no text)";

/** What changed from revision a to b, and whether it looks major (an answer, point value, or the set of questions changed) or minor (wording, feedback, settings that don't affect passing). */
export function diffRevisions(a: RevData, b: RevData): Diff {
  const A = new Map(a.questions.map((q) => [q.qkey, q])), B = new Map(b.questions.map((q) => [q.qkey, q]));
  const changed: Diff["changed"] = [];
  for (const [k, q] of B) {
    const o = A.get(k); if (!o) continue;
    const fields = [o.type !== q.type && "type", o.prompt_html !== q.prompt_html && "wording", o.feedback_html !== q.feedback_html && "feedback", o.points !== q.points && "points", o.required_correct !== q.required_correct && "critical flag", canon(o.config) !== canon(q.config) && "options"].filter(Boolean) as string[];
    if (fields.length) changed.push({ qkey: k, label: plain(q), fields, keyChanged: o.type !== q.type || o.points !== q.points || o.required_correct !== q.required_correct || canon(keyOf(o)) !== canon(keyOf(q)) });
  }
  const added = [...B.keys()].filter((k) => !A.has(k)), removed = [...A.keys()].filter((k) => !B.has(k));
  const settings = SETTINGS.filter((k) => canon(a.settings[k]) !== canon(b.settings[k])).map((key) => ({ key, from: a.settings[key], to: b.settings[key] }));
  const common = a.questions.map((q) => q.qkey).filter((k) => B.has(k)).join(), moved = common !== b.questions.map((q) => q.qkey).filter((k) => A.has(k)).join();
  const major = added.length || removed.length || changed.some((c) => c.keyChanged) || settings.some((s) => ["pass_pct", "pool_size"].includes(s.key));
  return { settings, added, removed, changed, moved, suggest: major ? "major" : "minor" };
}
