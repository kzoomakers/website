// Runs once when the server starts: a minute timer for scheduled emails (and to resume interrupted sends).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    (await import("./lib/httplog-hook")).installHttpLog(); // HTTP log (Admin > Services), with response codes
    const { tick } = await import("./lib/mail");
    setInterval(() => tick().catch(() => {}), 60_000);
    const { checkStale, checkReminders } = await import("./lib/tours");
    setInterval(() => checkReminders().catch(() => {}), 60_000); // "due now / in 1, 3, 6 hours" lines in the tours timeline
    setInterval(() => checkStale().catch(() => {}), 30 * 60_000); // untaken walk-ups
  }
}
