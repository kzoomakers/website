// Runs once when the server starts: a minute timer for scheduled emails (and to resume interrupted sends).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    (await import("./lib/httplog-hook")).installHttpLog(); // HTTP log (Admin > Services), with response codes
    const { withLock } = await import("./lib/db");
    // A second machine skips a job another one is running, so scaling out can't double-send mail or reminders.
    const job = (id: number, ms: number, fn: () => Promise<unknown>) => setInterval(() => withLock(id, fn).catch(() => {}), ms);
    const { warmSitemap } = await import("./lib/sitemap");
    const warm = () => warmSitemap().catch(() => {}); // sitemap page + sitemap.xml are served from memory
    warm();
    setInterval(warm, 2.5 * 3600_000);
    const { tick } = await import("./lib/mail");
    job(7351911, 60_000, tick);
    const { checkStale, checkReminders, sendRejectedSummary } = await import("./lib/tours");
    job(7351912, 60_000, checkReminders); // "due now / in 1, 3, 6 hours" lines in the tours timeline
    job(7351913, 30 * 60_000, checkStale); // untaken walk-ups
    job(7351918, 3600_000, () => sendRejectedSummary()); // monthly list of out-of-Michigan tour requests to contact@
    const { runAlerts, runDigest } = await import("./lib/ga-notify");
    job(7351915, 3 * 3600_000, runAlerts); // spike/drop notice to the google-analytics-notices topic (once a day at most)
    job(7351916, 3600_000, runDigest); // weekly email summary, Mondays from 8am Eastern, if switched on
    const { runGuestMail } = await import("./lib/guests");
    job(7351917, 3600_000, runGuestMail); // guest agreement update emails (a slow trickle) and scheduled guest deletions
    const { prune } = await import("./lib/retention");
    setTimeout(() => withLock(7351914, prune).catch(() => {}), 120_000); // not at the very start
    job(7351914, 6 * 3600_000, prune); // data past the 5-year limit (lib/retention.ts)
  }
}
