import vm from "node:vm";
import { cleanHtml } from "../sanitize";

// Question types for training tests. Pure (no database, no React) so grading is unit-testable and the same code runs for preview and for real attempts.
// A question's `config` holds its answer key. It must NEVER reach a member's browser while they are taking a test: only `toMember()` output may.
import { TYPES, TYPE_LABEL, type QType } from "./blank";
export { TYPES, TYPE_LABEL, type QType };
export type Q = { id?: number; qkey?: string; position?: number; type: QType; prompt_html: string; points: number; config: any; feedback_html: string; required_correct: boolean };

const MAX_CHOICES = 12, MAX_TEXT = 300, MAX_ITEMS = 20;
const str = (v: unknown, n = MAX_TEXT) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v: unknown, n = MAX_ITEMS): any[] => (Array.isArray(v) ? v.slice(0, n) : []);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const pct = (v: unknown) => Math.round(Math.min(100, Math.max(0, num(v))) * 100) / 100;
const idOf = (v: unknown, i: number) => (typeof v === "string" && /^[a-z0-9_-]{1,24}$/i.test(v) ? v : "i" + i);
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as any) : {});
const image = (v: unknown) => { const s = str(v, 300); return /^\/uploads\/[\w\-./]+$/.test(s) && !s.includes("..") ? s : ""; };
const items = (v: unknown, n = MAX_ITEMS) => list(v, n).map((x, i) => ({ id: idOf(obj(x).id, i), text: str(obj(x).text) }));
const region = (x: any) => ({ x: pct(x?.x), y: pct(x?.y), w: pct(x?.w), h: pct(x?.h) });
const intIn = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : -1);
const dupes = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase())).size !== xs.length;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const text = (xs: any[]) => xs.map((x) => (typeof x === "string" ? x : x.text));

/** Seeded shuffle so a reload shows the same order but a retry (new seed) differs. */
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const shuffled = <T,>(xs: T[], rnd: () => number, on = true) => { const a = xs.slice(); if (on) for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const frac = (right: number, total: number) => (total > 0 ? right / total : 0);

type Def = {
  clean: (c: any) => any; // bounded and normalized; never throws, may be unfinished (drafts)
  validate: (c: any) => string[]; // what stops publishing
  toMember: (c: any, rnd: () => number, shuffle: boolean) => any; // no key in here
  grade: (c: any, a: any) => number; // 0..1, never throws on a malformed answer
  key: (c: any) => unknown; // the answer-bearing part, to tell a typo fix from a changed answer
  describe: (c: any) => string;
};

const TYPE_DEFS: Record<QType, Def> = {
  mc_single: {
    clean: (c) => { const choices = list(c?.choices, MAX_CHOICES).map((x) => str(x)); return { choices, correct: intIn(c?.correct, choices.length) }; },
    validate: (c) => [...(c.choices.filter(Boolean).length < 2 ? ["Give at least two choices."] : []), ...(dupes(c.choices.filter(Boolean)) ? ["Two choices are the same."] : []), ...(c.correct < 0 || !c.choices[c.correct] ? ["Mark the correct choice."] : [])],
    toMember: (c, rnd, sh) => ({ choices: shuffled(c.choices.map((t: string, i: number) => ({ i, text: t })).filter((x: any) => x.text), rnd, sh) }),
    grade: (c, a) => (a === c.correct ? 1 : 0),
    key: (c) => c.choices[c.correct],
    describe: (c) => c.choices.map((t: string, i: number) => (i === c.correct ? `[x] ${t}` : t)).join(" | "),
  },
  mc_multi: {
    clean: (c) => { const choices = list(c?.choices, MAX_CHOICES).map((x) => str(x)); return { choices, correct: [...new Set(list(c?.correct, MAX_CHOICES).filter((i) => intIn(i, choices.length) >= 0))].sort((a: number, b: number) => a - b), scoring: c?.scoring === "partial" ? "partial" : "all" }; },
    validate: (c) => [...(c.choices.filter(Boolean).length < 2 ? ["Give at least two choices."] : []), ...(dupes(c.choices.filter(Boolean)) ? ["Two choices are the same."] : []), ...(!c.correct.length || c.correct.some((i: number) => !c.choices[i]) ? ["Mark at least one correct choice."] : [])],
    toMember: (c, rnd, sh) => ({ choices: shuffled(c.choices.map((t: string, i: number) => ({ i, text: t })).filter((x: any) => x.text), rnd, sh), scoring: c.scoring }),
    grade: (c, a) => {
      const picked = new Set<number>(Array.isArray(a) ? a.filter((i) => intIn(i, c.choices.length) >= 0) : []), ok = new Set<number>(c.correct);
      const right = [...picked].filter((i) => ok.has(i)).length, wrong = picked.size - right;
      return c.scoring === "partial" ? Math.max(0, frac(right - wrong, ok.size)) : right === ok.size && wrong === 0 ? 1 : 0;
    },
    key: (c) => ({ correct: c.correct.map((i: number) => c.choices[i]), scoring: c.scoring }),
    describe: (c) => c.choices.map((t: string, i: number) => (c.correct.includes(i) ? `[x] ${t}` : t)).join(" | "),
  },
  true_false: {
    clean: (c) => ({ correct: c?.correct !== false }),
    validate: () => [],
    toMember: () => ({}),
    grade: (c, a) => (a === c.correct ? 1 : 0),
    key: (c) => c.correct,
    describe: (c) => (c.correct ? "True" : "False"),
  },
  image_label: {
    clean: (c) => {
      const zones = list(c?.zones).map((z, i) => ({ id: idOf(z?.id, i), ...region(z) })), labels = items(c?.labels), zid = new Set(zones.map((z) => z.id)), lid = new Set(labels.map((l) => l.id));
      return { image: image(c?.image), alt: str(c?.alt), zones, labels, reuse: c?.reuse === true, key: Object.fromEntries(Object.entries(obj(c?.key)).filter(([z, l]) => zid.has(z) && typeof l === "string" && lid.has(l))) };
    },
    validate: (c) => [
      ...(!c.image ? ["Upload the diagram."] : []), ...(!c.alt ? ["Describe the diagram in the alt text."] : []), ...(!c.zones.length ? ["Draw at least one label area on the diagram."] : []),
      ...(c.zones.some((z: any) => z.w < 1 || z.h < 1) ? ["A label area is too small to click."] : []), ...(c.labels.some((l: any) => !l.text) ? ["Every name needs text."] : []),
      ...(c.zones.some((z: any) => !c.key[z.id]) ? ["Every label area needs its correct name."] : []),
      ...(!c.reuse && new Set(Object.values(c.key)).size !== Object.values(c.key).length ? ["Two areas use the same name; tick \"names can be used more than once\" or fix the answers."] : []),
    ],
    toMember: (c, rnd, sh) => ({ image: c.image, alt: c.alt, reuse: c.reuse, zones: c.zones, labels: shuffled(c.labels, rnd, sh) }),
    grade: (c, a) => { const m = obj(a); return frac(c.zones.filter((z: any) => typeof m[z.id] === "string" && m[z.id] === c.key[z.id]).length, c.zones.length); },
    key: (c) => ({ zones: c.zones, key: Object.fromEntries(Object.entries(c.key).map(([z, l]) => [z, c.labels.find((x: any) => x.id === l)?.text])) }),
    describe: (c) => `${c.zones.length} areas, ${c.labels.length} names`,
  },
  match: {
    clean: (c) => {
      const left = items(c?.left), right = items(c?.right), lid = new Set(left.map((x) => x.id)), rid = new Set(right.map((x) => x.id));
      return { left, right, key: Object.fromEntries(Object.entries(obj(c?.key)).filter(([l, r]) => lid.has(l) && typeof r === "string" && rid.has(r))) };
    },
    validate: (c) => [...(c.left.length < 2 ? ["Give at least two items to match."] : []), ...(c.left.some((x: any) => !x.text) || c.right.some((x: any) => !x.text) ? ["Every item needs text."] : []), ...(c.left.some((x: any) => !c.key[x.id]) ? ["Every item needs its match."] : []), ...(c.right.length < c.left.length ? ["Need at least as many answers as items."] : [])],
    toMember: (c, rnd, sh) => ({ left: c.left, right: shuffled(c.right, rnd, sh) }),
    grade: (c, a) => { const m = obj(a); return frac(c.left.filter((l: any) => typeof m[l.id] === "string" && m[l.id] === c.key[l.id]).length, c.left.length); },
    key: (c) => c.left.map((l: any) => [l.text, c.right.find((r: any) => r.id === c.key[l.id])?.text]),
    describe: (c) => c.left.map((l: any) => `${l.text} = ${c.right.find((r: any) => r.id === c.key[l.id])?.text ?? "?"}`).join(" | "),
  },
  order: {
    clean: (c) => ({ items: items(c?.items) }),
    validate: (c) => [...(c.items.length < 2 ? ["Give at least two steps."] : []), ...(c.items.some((x: any) => !x.text) ? ["Every step needs text."] : [])],
    toMember: (c, rnd, sh) => { let out = shuffled(c.items, rnd, sh); for (let t = 0; sh && c.items.length > 1 && t < 5 && out.every((x: any, i: number) => x.id === c.items[i].id); t++) out = shuffled(c.items, rnd, sh); return { items: out }; },
    grade: (c, a) => { const ids = Array.isArray(a) ? a : []; if (ids.length !== c.items.length || new Set(ids).size !== ids.length) return 0; return frac(c.items.filter((x: any, i: number) => ids[i] === x.id).length, c.items.length); },
    key: (c) => text(c.items),
    describe: (c) => text(c.items).map((t: string, i: number) => `${i + 1}. ${t}`).join(" "),
  },
  fill_blank: {
    clean: (c) => ({ text: str(c?.text, 2000), slots: list(c?.slots).map((s) => { const choices = list(s?.choices, MAX_CHOICES).map((x) => str(x)); return { choices, correct: intIn(s?.correct, choices.length) }; }) }),
    validate: (c) => { const n = [...c.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => +m[1]); return [...(!n.length ? ["Put {{1}} in the text where the first blank goes."] : []), ...(n.some((x) => x < 1 || x > c.slots.length) || new Set(n).size !== n.length || new Set(n).size !== c.slots.length ? ["The blanks {{1}}, {{2}}… must each appear once and match the lists below."] : []), ...(c.slots.some((s: any) => s.choices.filter(Boolean).length < 2 || s.correct < 0 || !s.choices[s.correct]) ? ["Every blank needs two or more choices and a correct one."] : [])]; },
    toMember: (c, rnd, sh) => ({ text: c.text, slots: c.slots.map((s: any) => ({ choices: shuffled(s.choices.map((t: string, i: number) => ({ i, text: t })).filter((x: any) => x.text), rnd, sh) })) }),
    grade: (c, a) => { const v = Array.isArray(a) ? a : []; return frac(c.slots.filter((s: any, i: number) => v[i] === s.correct).length, c.slots.length); },
    key: (c) => c.slots.map((s: any) => s.choices[s.correct]),
    describe: (c) => c.text.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => `[${c.slots[+n - 1]?.choices[c.slots[+n - 1]?.correct] ?? "?"}]`),
  },
  short_text: {
    clean: (c) => ({ accepted: list(c?.accepted, 20).map((x) => str(x, 100)), regex: str(c?.regex, 120) }),
    validate: (c) => {
      let bad = false;
      if (c.regex) {
        if (/\([^)]*([+*]|\{\d+,\d*\}|\|)[^)]*\)[+*{]/.test(c.regex)) bad = true;
        else try { new RegExp(c.regex, "i"); } catch { bad = true; }
      }
      return [...(!c.accepted.filter(Boolean).length && !c.regex ? ["Give at least one accepted answer."] : []), ...(bad ? ["That pattern isn't valid or is too complex."] : [])];
    },
    toMember: () => ({}),
    grade: (c, a) => {
      if (typeof a !== "string") return 0;
      const s = norm(a.slice(0, 200));
      if (s && c.accepted.some((x: string) => x && norm(x) === s)) return 1;
      if (s && c.regex) try { return vm.runInNewContext("new RegExp(p, 'i').test(s)", { p: c.regex, s }, { timeout: 50 }) ? 1 : 0; } catch { return 0; }
      return 0;
    },
    key: (c) => ({ accepted: c.accepted.map(norm).sort(), regex: c.regex }),
    describe: (c) => [...c.accepted.filter(Boolean), ...(c.regex ? [`/${c.regex}/`] : [])].join(" | "),
  },
  numeric: {
    clean: (c) => ({ value: num(c?.value), tolerance: Math.max(0, num(c?.tolerance)), unit: str(c?.unit, 20) }),
    validate: () => [],
    toMember: (c) => ({ unit: c.unit }),
    grade: (c, a) => { const s = typeof a === "string" ? a.trim().replace(",", ".") : typeof a === "number" ? String(a) : ""; if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return 0; return Math.abs(+s - c.value) <= c.tolerance + 1e-9 ? 1 : 0; },
    key: (c) => [c.value, c.tolerance],
    describe: (c) => `${c.value}${c.tolerance ? ` ± ${c.tolerance}` : ""} ${c.unit}`.trim(),
  },
  hotspot: {
    clean: (c) => ({ image: image(c?.image), alt: str(c?.alt), regions: list(c?.regions, 10).map(region) }),
    validate: (c) => [...(!c.image ? ["Upload the picture."] : []), ...(!c.alt ? ["Describe the picture in the alt text."] : []), ...(!c.regions.length ? ["Draw the area that counts as correct."] : []), ...(c.regions.some((r: any) => r.w < 1 || r.h < 1) ? ["A correct area is too small to click."] : [])],
    toMember: (c) => ({ image: c.image, alt: c.alt }),
    grade: (c, a) => { const p = obj(a); return typeof p.x === "number" && typeof p.y === "number" && c.regions.some((r: any) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) ? 1 : 0; },
    key: (c) => c.regions,
    describe: (c) => `${c.regions.length} correct area(s)`,
  },
};

export const cleanConfig = (t: QType, c: unknown) => TYPE_DEFS[t].clean(c);
export const describeQ = (q: Pick<Q, "type" | "config">) => TYPE_DEFS[q.type].describe(q.config);
export const keyOf = (q: Pick<Q, "type" | "config">) => TYPE_DEFS[q.type].key(q.config);
const cleanText = (v: unknown, n: number) => cleanHtml(typeof v === "string" ? v.slice(0, n) : "");

/** A question as stored: bounded and sanitized. Unfinished questions are fine in a draft; publishing runs problems(). */
export function cleanQuestion(x: any): Q {
  const type: QType = (TYPES as readonly string[]).includes(x?.type) ? x.type : "mc_single";
  return { type, prompt_html: cleanText(x?.prompt_html, 5000), feedback_html: cleanText(x?.feedback_html, 2000), points: Math.min(100, Math.max(0.25, Math.round(num(x?.points, 1) * 100) / 100)), required_correct: x?.required_correct === true, config: TYPE_DEFS[type].clean(x?.config) };
}
/** What stops this question from being published (empty = fine). */
export const problems = (q: Q): string[] => [...(q.prompt_html.replace(/<[^>]*>/g, "").trim() ? [] : ["Write the question."]), ...TYPE_DEFS[q.type].validate(q.config)];
/** Fraction of the question's points earned, 0..1. */
export const gradeQ = (q: Pick<Q, "type" | "config">, answer: unknown) => { const f = TYPE_DEFS[q.type].grade(q.config, answer); return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0; };

export type MemberQ = { id: number; type: QType; prompt_html: string; points: number; view: any };
/** The only shape of a question a member may be sent while attempting: prompt and options, never the key or feedback. */
export function memberQuestion(q: Q & { id: number }, seed: number, shuffle = true): MemberQ {
  const rnd = mulberry(hash(`${seed}:${q.qkey ?? q.id}`));
  return { id: q.id, type: q.type, prompt_html: cleanHtml(q.prompt_html), points: q.points, view: TYPE_DEFS[q.type].toMember(q.config, rnd, shuffle) };
}

/** The questions one attempt shows: a seeded pick of `pool` of them (all when unset), in a seeded order or the author's. Same seed, same result, so a reload matches. */
export function drawQuestions<T extends { id: number }>(qs: T[], seed: number, pool: number | null, shuffle: boolean): T[] {
  const rnd = mulberry(hash(`draw:${seed}`)), picked = pool && pool < qs.length ? shuffled(qs, rnd).slice(0, pool) : qs;
  return shuffle ? shuffled(picked, rnd) : qs.filter((q) => picked.includes(q));
}

export type Scored = { per: { id: number; points: number; max: number; correct: boolean }[]; points: number; max: number; pct: number; passed: boolean; criticalMissed: number };
/** Grades a whole attempt. A critical question must be fully right whatever the total is. Used by preview now and by real attempts in the next phase. */
export function scoreQuestions(qs: (Q & { id: number })[], answers: Record<string, unknown>, passPct: number): Scored {
  const per = qs.map((q) => { const f = gradeQ(q, answers[q.id]); return { id: q.id, points: Math.round(f * q.points * 100) / 100, max: q.points, correct: f === 1 }; });
  const points = per.reduce((a, x) => a + x.points, 0), max = per.reduce((a, x) => a + x.max, 0), pct = max ? Math.round((points / max) * 10000) / 100 : 0;
  const criticalMissed = qs.filter((q, i) => q.required_correct && !per[i].correct).length;
  return { per, points: Math.round(points * 100) / 100, max, pct, passed: max > 0 && pct >= passPct && criticalMissed === 0, criticalMissed };
}
