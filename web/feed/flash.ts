import type { Submission } from "./models/submit";

// A failed form is parked here and shown once on the next page view, so error text and the person's input never travel in the address bar.
// shortcut: in-process memory (one Fly machine today, see plan 5.8); move to a Postgres TTL table if the app scales out.
type Flash = { input: Submission; errors: string[]; similar?: { short_id: string; title: string }[] };
const parked = new Map<number, Flash & { exp: number }>();
export const putFlash = (userId: number, f: Flash) => {
  const now = Date.now();
  for (const [k, v] of parked) if (v.exp < now) parked.delete(k);
  parked.set(userId, { ...f, exp: now + 300_000 });
};
export const takeFlash = (userId: number): Flash | null => { const f = parked.get(userId); parked.delete(userId); return f && f.exp > Date.now() ? f : null; };

// Same idea for a failed comment form.
type CFlash = { text: string; errors: string[] };
const cparked = new Map<number, CFlash & { exp: number }>();
export const putCommentFlash = (userId: number, f: CFlash) => {
  const now = Date.now();
  for (const [k, v] of cparked) if (v.exp < now) cparked.delete(k);
  cparked.set(userId, { ...f, exp: now + 300_000 });
};
export const takeCommentFlash = (userId: number): CFlash | null => { const f = cparked.get(userId); cparked.delete(userId); return f && f.exp > Date.now() ? f : null; };
