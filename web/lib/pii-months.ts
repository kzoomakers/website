export const REPORT_TO = "board@kzoomakers.org"; // where the monthly PII and training-override reports go
// Which month's PII report is due. Pure (dates only), so the tests can load it.
export const SITE_DAY = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); // YYYY-MM-DD in site time
/** The month that has just ended in site time (YYYY-MM). Reports go out once a month has fully ended, so nothing viewed on its last evening is missed. */
export function lastFullMonth(now: Date, tz: string) {
  const [y, m] = SITE_DAY(now, tz).slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
