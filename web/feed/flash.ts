import type { Submission } from "./models/submit";

// A failed form is parked here and shown once on the next page view, so error text and the person's input never travel in the address bar.
// shortcut: in-process memory (one Fly machine today, see plan 5.8); move to a Postgres TTL table if the app scales out.
type CFlash = { text: string; errors: string[] };
type Flash = { input: Submission; errors: string[]; similar?: { short_id: string; title: string }[] };
// Kept on globalThis: Next bundles the form's POST route and the page that shows the message separately, and a plain module-level Map would then be two different Maps (the message is put in one and looked for in the other).
const g = globalThis as unknown as { feedFlash?: { s: Map<number, Flash & { exp: number }>; c: Map<number, CFlash & { exp: number }>; e: Map<number, { msg: string; exp: number; ok: boolean }> } };
const shared = (g.feedFlash ??= { s: new Map(), c: new Map(), e: new Map() });
const parked = shared.s;
export const putFlash = (userId: number, f: Flash) => {
  const now = Date.now();
  for (const [k, v] of parked) if (v.exp < now) parked.delete(k);
  parked.set(userId, { ...f, exp: now + 300_000 });
};
export const takeFlash = (userId: number): Flash | null => { const f = parked.get(userId); parked.delete(userId); return f && f.exp > Date.now() ? f : null; };

// Same idea for a failed comment form.
const cparked = shared.c;
export const putCommentFlash = (userId: number, f: CFlash) => {
  const now = Date.now();
  for (const [k, v] of cparked) if (v.exp < now) cparked.delete(k);
  cparked.set(userId, { ...f, exp: now + 300_000 });
};
export const takeCommentFlash = (userId: number): CFlash | null => { const f = cparked.get(userId); cparked.delete(userId); return f && f.exp > Date.now() ? f : null; };

// And for a refused vote, hide, save or moderator action: one message, shown once at the top of the next page.
const eparked = shared.e;
/** `ok` makes it a confirmation ("Invitation sent") instead of an error. */
export const putError = (userId: number, msg: string, ok = false) => {
  const now = Date.now();
  for (const [k, v] of eparked) if (v.exp < now) eparked.delete(k);
  eparked.set(userId, { msg, exp: now + 300_000, ok });
};
export const takeError = (userId: number): { msg: string; ok: boolean } | null => { const f = eparked.get(userId); eparked.delete(userId); return f && f.exp > Date.now() ? { msg: f.msg, ok: f.ok } : null; };
