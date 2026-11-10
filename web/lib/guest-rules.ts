// Pure rules for guests (no database), so they can be tested on their own.
export type Tier = { from: number; send: number };
export type GuestCfg = { retentionYears: number; linkHours: number; weeklyLimit: number; noticeTiers: Tier[]; deletePerDay: number };
// noticeTiers: when today's total emails sent is at least `from`, guest notices are capped at `send` for the day (the highest matching `from` wins).
export const DEFAULT_CFG: GuestCfg = { retentionYears: 2, linkHours: 6, weeklyLimit: 3, deletePerDay: 3,
  noticeTiers: [{ from: 0, send: 10 }, { from: 61, send: 4 }, { from: 66, send: 3 }, { from: 71, send: 2 }, { from: 76, send: 1 }, { from: 81, send: 0 }] };

/** How many guest notices may go out now, given today's email total and how many notices already went. */
export const noticeAllowance = (tiers: Tier[], totalToday: number, sentToday: number) => {
  const t = [...tiers].sort((a, b) => b.from - a.from).find((x) => totalToday >= x.from);
  return Math.max(0, (t?.send ?? 0) - sentToday);
};


export const TZ = "America/Detroit";
export const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { timeZone: TZ, month: "2-digit", day: "2-digit", year: "numeric" });
export const deleteText = (on: string | Date, host: string, years: number) =>
  `Your profile has been scheduled to delete on midnight at ${fmtDate(on)} exactly ${years} years since your last visit, per the recordkeeping policy you agreed to. Your request to delete will be cancelled if ${host} brings you back before this date. You will be emailed right before your personal data is deleted when we do it!`;

const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in Detroit
/** Records are kept for `years` after the last visit (or, with no visit yet, after signing). Never signed = nothing to keep. A guest becomes deletable on the day after that date, so the full period is always kept. */
export function retention(lastVisit: string | Date | null, signedAt: string | Date | null, everSigned: boolean, years: number, now = new Date()) {
  const base = [lastVisit, signedAt].filter(Boolean).map((d) => +new Date(d as string)).sort((a, b) => b - a)[0];
  const until = everSigned && base ? new Date(new Date(base).setFullYear(new Date(base).getFullYear() + years)) : null;
  return { until, deletable: !until || dayOf(now) > dayOf(until) };
}
