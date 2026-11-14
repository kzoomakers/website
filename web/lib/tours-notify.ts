import { memo, forget } from "./memo";
import { db } from "./db";
import { addLink, notify, personalTopics, removeLink, subscribersOf, TOUR_EVENTS, type TourEvent } from "./ntfy";
import { cleanDays, cleanEmail } from "./tours-fmt";
import { getMailCfg, mailReady, sendQueued as send } from "./mail";

// Who hears about tour events. Email: a list of addresses per event, kept in settings. Push: the event's special ntfy topic, with people's own topics
// attached to it by a link, so one publish reaches everyone. Both are edited in Admin > Tours > Notifications.
export type Cfg = { emails: Record<TourEvent, string[]>; staleDays: number };
const EVENTS = Object.keys(TOUR_EVENTS) as TourEvent[];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

type Q = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> };
async function readCfg(c: Q): Promise<Cfg> {
  const v = (await c.query("SELECT data FROM settings WHERE key = 'tours:notify'")).rows[0]?.data ?? {};
  return { emails: Object.fromEntries(EVENTS.map((e) => [e, Array.isArray(v.emails?.[e]) ? v.emails[e] : []])) as Cfg["emails"], staleDays: Number.isInteger(v.staleDays) ? v.staleDays : 4 };
}
export const getCfg = async () => readCfg(await pool());

export const PAUSE_MESSAGE = "We are in the middle of moving and can't book tours right now. Leave your details and you'll be added to our queue. We'll reach out as soon as tours resume.";
/** Signups-paused switch and its public message, in settings. Never throws, so a database hiccup can't take down the homepage. */
export const getPause = (): Promise<{ paused: boolean; message: string }> => memo("pause", 30_000, async () => {
  try {
    const v = (await (await pool()).query("SELECT data FROM settings WHERE key = 'tours:pause'")).rows[0]?.data ?? {};
    return { paused: v.paused === true, message: typeof v.message === "string" && v.message.trim() ? v.message : PAUSE_MESSAGE };
  } catch { return { paused: false, message: PAUSE_MESSAGE }; }
});
export async function savePause(paused: unknown, message: unknown) {
  const m = String(message ?? "").trim().slice(0, 600) || PAUSE_MESSAGE;
  await (await pool()).query("INSERT INTO settings (key, data) VALUES ('tours:pause', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ paused: paused === true, message: m })]);
  forget("pause");
  return { paused: paused === true, message: m };
}

/** Changes one thing in the settings while holding a lock, so two staff editing at once (or two machines) can't overwrite each other's change. */
async function edit(change: (c: Cfg) => void) {
  const client = await (await pool()).connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('tours:notify'))");
    const cfg = await readCfg(client);
    change(cfg);
    await client.query("INSERT INTO settings (key, data) VALUES ('tours:notify', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(cfg)]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}
const checked = (event: unknown): TourEvent => { if (!EVENTS.includes(event as TourEvent)) throw new Error("Unknown notification."); return event as TourEvent; };

export const addEmail = (event: unknown, email: unknown) => {
  const e = checked(event), m = cleanEmail(email);
  return edit((c) => { if (c.emails[e].includes(m)) return; if (c.emails[e].length >= 50) throw new Error("Up to 50 addresses per notification."); c.emails[e].push(m); });
};
export const removeEmail = (event: unknown, email: unknown) => { const e = checked(event), m = String(email ?? "").trim().toLowerCase(); return edit((c) => { c.emails[e] = c.emails[e].filter((x) => x !== m); }); };
export const setStaleDays = (days: unknown) => { const n = cleanDays(days); return edit((c) => { c.staleDays = n; }); };

/** Everything the Notifications page shows: settings, who is attached to each event topic, and the topics that can be attached. */
export async function overview() {
  const [cfg, people] = await Promise.all([getCfg(), personalTopics()]);
  const subs = Object.fromEntries(await Promise.all(EVENTS.map(async (e) => [e, await subscribersOf(TOUR_EVENTS[e][0])])));
  return { cfg, pause: await getPause(), subs, people, events: Object.fromEntries(EVENTS.map((e) => [e, TOUR_EVENTS[e][1]])) };
}

export const subscribe = async (event: unknown, topic: unknown) => {
  const name = String(topic), p = (await personalTopics()).find((t: any) => t.name === name);
  if (!p) throw new Error("Pick one of the people's topics.");
  await addLink(TOUR_EVENTS[checked(event)][0], name);
};
export const unsubscribe = (event: unknown, topic: unknown) => removeLink(TOUR_EVENTS[checked(event)][0], String(topic));

/** Tells everyone signed up for `event`: a push to its topic and an email to its list. Never throws, so a failed notice can't fail a booking. */
export async function announce(event: TourEvent, m: { subject: string; lines: string[]; tags?: string; click?: string; priority?: number }) {
  await notify(TOUR_EVENTS[event][0], { title: m.subject, message: m.lines.join("\n"), tags: m.tags, click: m.click, priority: m.priority });
  try {
    const [cfg, mc] = [await getCfg(), await getMailCfg()];
    if (!mailReady(mc)) return;
    const html = m.lines.map((l) => `<p>${esc(l)}</p>`).join("") + (m.click ? `<p><a href="${esc(m.click)}">Open in the admin</a></p>` : "");
    for (const to of cfg.emails[event]) await send({ to, subject: m.subject, text: m.lines.join("\n\n") + (m.click ? `\n\n${m.click}` : ""), html }, mc).catch((e) => console.error("tour notice email failed:", e));
  } catch (e) { console.error("tour notice failed:", e); }
}
