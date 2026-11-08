// Small pure rules, kept apart from the database code so tests can import them.
export const MIN_CLASS_DAYS = 45; // hard floor: the admin setting can raise the notice but never lower it
export const noticeDays = (stored: unknown) => { const n = Number(stored); return Number.isFinite(n) ? Math.max(n, MIN_CLASS_DAYS) : MIN_CLASS_DAYS; };

export const MAX_MAIL_TRIES = 8;
/** Minutes to wait before try number `tries + 1`: 2, 4, 8 ... capped at 6 hours. */
export const backoffMinutes = (tries: number) => Math.min(2 ** tries, 360);
