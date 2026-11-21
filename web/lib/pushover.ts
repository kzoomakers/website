import { Pushover } from "pushover-js";
import { openText, sealText } from "./vault";
import { db } from "./db";

// Staff alerts go out through Pushover (https://pushover.net). One application token, plus one Delivery Group key per kind of alert; who is in each
// group is managed on pushover.net. Settings and a short log of what was sent live in Admin > Setup > Alert delivery.
export const CHANNELS = {
  tours: "Tour activity (cancellations, requests, replies, check-in answers)",
  booked: "A tour is booked",
  walkup_new: "A walk-up request is created",
  walkup_taken: "A volunteer takes a walk-up request",
  walkup_stale: "A walk-up request is still untaken after a few days",
  ga: "Traffic spikes and drops from Google Analytics",
  training: "Training: people ready for sign-off (batched every 15 minutes)",
  pii: "PII access alerts (bulk viewing, a non-admin opening a Gov ID)",
} as const;
export type Channel = keyof typeof CHANNELS;
export const channelOk = (c: unknown): c is Channel => typeof c === "string" && c in CHANNELS;
/** Tour events that staff can also be emailed about (a subset of the channels). */
export const TOUR_EVENTS = { booked: CHANNELS.booked, walkup_new: CHANNELS.walkup_new, walkup_taken: CHANNELS.walkup_taken, walkup_stale: CHANNELS.walkup_stale } as const;
export type TourEvent = keyof typeof TOUR_EVENTS;

export type Cfg = { token: string; groups: Partial<Record<Channel, string>> };
export type Msg = { title?: string; message?: string; priority?: number; click?: string; tags?: string };
const KEY_OK = /^[A-Za-z0-9]{20,40}$/; // Pushover app tokens, user keys and group keys are 30 characters
const MAX_LOG_DAYS = 90;

let ready: Promise<unknown> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= (async () => {
    const p = d.pool;
    await p.query(`CREATE TABLE IF NOT EXISTS pushover_log (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), channel text NOT NULL, title text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '',
      priority int NOT NULL DEFAULT 0, status text NOT NULL, error text NOT NULL DEFAULT '', sender text NOT NULL DEFAULT '')`);
    await p.query("CREATE INDEX IF NOT EXISTS pushover_log_at ON pushover_log (at DESC)");
    // One-time move off the old self-hosted ntfy server: its tables are dropped, and the page permission keeps its holders under the new name.
    await p.query("DROP TABLE IF EXISTS ntfy_links, ntfy_clients, ntfy_tokens, ntfy_messages, ntfy_topics CASCADE");
    await p.query("DELETE FROM settings WHERE key = 'ntfy:config'");
    await p.query("UPDATE user_perms SET section = 'system:pushover' WHERE section = 'admin:ntfy' AND NOT EXISTS (SELECT 1 FROM user_perms u WHERE u.user_id = user_perms.user_id AND u.section = 'system:pushover')");
    await p.query("DELETE FROM user_perms WHERE section = 'admin:ntfy'");
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}
const q = async (sql: string, args: unknown[] = []) => (await (await conn()).query(sql, args)).rows;

let cache: { at: number; v: Cfg } | undefined;
export async function getCfg(): Promise<Cfg> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const d = (await q("SELECT data FROM settings WHERE key = 'pushover:config'"))[0]?.data ?? {};
  const v: Cfg = { token: openText(d.token ?? ""), groups: d.groups ?? {} };
  cache = { at: Date.now(), v };
  return v;
}
/** x = { token?, clearToken?, groups: { [channel]: key } }. A blank token or key keeps the saved one; the word "clear" in a group box removes it. */
export async function saveCfg(x: any) {
  const cur = await getCfg(), token = x.clearToken ? "" : String(x.token ?? "").trim() || cur.token, groups: Cfg["groups"] = {};
  if (token && !KEY_OK.test(token)) throw new Error("That doesn't look like a Pushover application token (30 letters and numbers).");
  for (const c of Object.keys(CHANNELS) as Channel[]) {
    const k = String(x.groups?.[c] ?? "").trim() || cur.groups[c] || "";
    if (!k || k === "clear") continue;
    if (!KEY_OK.test(k)) throw new Error(`The key for "${CHANNELS[c]}" doesn't look like a Pushover group key (30 letters and numbers).`);
    groups[c] = k;
  }
  await q("INSERT INTO settings (key, data) VALUES ('pushover:config', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ token: sealText(token), groups })]);
  cache = undefined;
}
/** For the admin page: which channels have a key, never the keys themselves. */
export async function adminView() {
  const c = await getCfg();
  return { hasToken: !!c.token, groups: Object.fromEntries((Object.keys(CHANNELS) as Channel[]).map((k) => [k, !!c.groups[k]])) as Record<Channel, boolean> };
}

// ntfy priorities 1-5 (what callers use: 2 low, 3 normal, 4 high, 5 urgent) -> Pushover -2..1. Never 2 (emergency): it repeats until acknowledged.
const PRIO = [-2, -1, 0, 1, 1] as const;
const prio = (p: unknown) => PRIO[Math.min(5, Math.max(1, Math.round(Number(p) || 3))) - 1];

/** Sends to the channel's group and logs the outcome. Never throws: a failed push must not fail a booking. Without a token or group key it logs "not configured" and does nothing. */
export async function notify(channel: Channel, m: Msg, sender = "system") {
  const title = (m.title ?? "").slice(0, 250), message = (m.message ?? "").slice(0, 1024) || "(no details)", priority = prio(m.priority);
  let status = "sent", error = "";
  try {
    const c = await getCfg(), key = c.groups[channel];
    if (!c.token || !key) { status = "not configured"; }
    else {
      const p = new Pushover(key, c.token).setPriority(priority);
      if (m.click) p.setUrl(m.click, "Open");
      await p.send(title, message);
    }
  } catch (e: any) { status = "failed"; error = String(e?.message ?? e?.errors ?? e).slice(0, 300); console.error("pushover send failed:", error); }
  try {
    await q("INSERT INTO pushover_log (channel, title, message, priority, status, error, sender) VALUES ($1,$2,$3,$4,$5,$6,$7)", [channel, title, message, priority, status, error, sender]);
    if (Math.random() < 0.02) await q("DELETE FROM pushover_log WHERE at < now() - make_interval(days => $1)", [MAX_LOG_DAYS]);
  } catch (e) { console.error("pushover log failed:", e); }
  return { status, error };
}

export const recent = () => q("SELECT id, at, channel, title, message, priority, status, error, sender FROM pushover_log ORDER BY id DESC LIMIT 100");

export const userKeyOk = (k: string) => KEY_OK.test(k);
/** One person's own Pushover key, through the site's application token (the Talk community site's reply, mention and message alerts). Never throws, and logs nothing: a personal key must not land in the staff log. */
export async function pushToUser(userKey: string, m: Msg): Promise<void> {
  try {
    const { token } = await getCfg();
    if (!token || !KEY_OK.test(userKey)) return;
    const p = new Pushover(userKey, token);
    if (m.click) p.setUrl(m.click, "Open");
    await p.send((m.title ?? "").slice(0, 250), (m.message ?? "").slice(0, 1024) || "(no details)");
  } catch (e: any) { console.error("pushover user send failed:", String(e?.message ?? e?.errors ?? e).slice(0, 200)); }
}
