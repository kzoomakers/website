import { conn } from "./db";

/** Nothing in these tables is kept longer than this. */
export const RETENTION_YEARS = 5;

// [table, timestamp column]. Names are constants (never user input).
const OLD: [string, string][] = [
  ["audit", "at"], ["page_revisions", "at"], ["tour_events", "at"], ["mail_clicks", "at"], ["contact_messages", "created_at"], ["notifications", "created_at"],
];

/** Deletes rows past the retention limit. Sent campaigns go too, and with them their per-recipient rows and clicks (cascade). Safe to run any time and as often as you like. */
export async function prune() {
  const c = await conn();
  const run = (sql: string, what: string) => c.query(sql, [RETENTION_YEARS]).catch((e) => { if (e.code !== "42P01") console.error("retention:", what, e.message); }); // 42P01: that module's table isn't created yet
  for (const [t, col] of OLD) await run(`DELETE FROM ${t} WHERE ${col} < now() - make_interval(years => $1)`, t);
  await run("DELETE FROM mail_campaigns WHERE status = 'sent' AND sent_at < now() - make_interval(years => $1)", "mail_campaigns");
}
