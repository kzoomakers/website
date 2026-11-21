import { conn, db, withTx } from "../db";
import { openText, sealText } from "../vault";
import { emitLeads } from "./notify";

// "Newly certified" posts to a Discord channel through a webhook (a plain HTTPS POST, no bot). Off until an administrator adds a webhook, and only for members who opted in.
// Settings live in their own settings row (key "training_discord") so the sealed URL never rides along with trainingCfg() to a page.
export type DiscordCfg = { enabled: boolean; webhook: string; name: string; avatar: string; embed: boolean; color: string; templates: string[] };
const DEFAULT: DiscordCfg = { enabled: false, webhook: "", name: "Kzoo Makers", avatar: "", embed: true, color: "#7c5cd6", templates: ["Congratulations {{name}}, you're now authorized on {{tool}}!"] };
const MAX_TRIES = 6, HOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/; // host allow-list: this setting can't aim the server at another URL

export const validWebhook = (u: string) => HOOK.test(u);
export const mask = (u: string) => (u ? u.replace(/\/webhooks\/(\d+)\/.*$/, "/webhooks/$1/••••••••") : "");
/** Backslash-escapes what Discord would read as markdown, mentions or links. */
export const escMd = (s: string) => s.replace(/[\\*_~`>|<@#:[\]()]/g, "\\$&");
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function load(): Promise<DiscordCfg> {
  const d = db();
  if (!d) return DEFAULT;
  await d.ready;
  return { ...DEFAULT, ...(await d.pool.query("SELECT data FROM settings WHERE key = 'training_discord'")).rows[0]?.data };
}
const store = async (c: Partial<DiscordCfg>) => { const d = db(); if (!d) throw new Error("No database."); await d.ready; await d.pool.query("INSERT INTO settings (key, data) VALUES ('training_discord', $1) ON CONFLICT (key) DO UPDATE SET data = settings.data || EXCLUDED.data", [JSON.stringify(c)]); };

/** What the Settings page may see: the webhook masked, never the real URL. */
export async function discordView() {
  const { webhook, ...c } = await load();
  return { ...c, hasWebhook: !!webhook, webhook: mask(webhook ? openText(webhook) : "") };
}

export async function saveDiscord(b: any) {
  const out: Partial<DiscordCfg> = {}, str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  if (typeof b?.webhook === "string" && b.webhook.trim()) { if (!validWebhook(b.webhook.trim())) throw new Error("That isn't a Discord webhook address (https://discord.com/api/webhooks/…)."); out.webhook = sealText(b.webhook.trim()); }
  if (b?.clearWebhook === true) { out.webhook = ""; out.enabled = false; }
  if (typeof b?.enabled === "boolean") out.enabled = b.enabled && (!!out.webhook || (out.webhook === undefined && !!(await load()).webhook));
  if (typeof b?.embed === "boolean") out.embed = b.embed;
  if (typeof b?.name === "string") out.name = str(b.name, 80) || DEFAULT.name;
  if (typeof b?.avatar === "string") { const a = str(b.avatar, 300); if (a && !/^https:\/\//.test(a)) throw new Error("The avatar must be an https:// address."); out.avatar = a; }
  if (typeof b?.color === "string") { if (!/^#[0-9a-f]{6}$/i.test(b.color)) throw new Error("Colour must look like #7c5cd6."); out.color = b.color; }
  if (Array.isArray(b?.templates)) { const t = b.templates.map((x: unknown) => str(x, 300)).filter(Boolean).slice(0, 10); out.templates = t.length ? t : DEFAULT.templates; }
  await store(out);
}

/** The JSON Discord receives. Pure. allowed_mentions is always empty so nothing in it can ping anyone; names are escaped; no images except the admin's own avatar. */
export function buildPayload(c: Pick<DiscordCfg, "name" | "avatar" | "embed" | "color" | "templates">, v: { name: string; tool: string }, pick = Math.random()) {
  const line = cap((c.templates[Math.floor(pick * c.templates.length)] ?? DEFAULT.templates[0]).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k === "name" ? escMd(v.name) : k === "tool" ? escMd(v.tool) : "")), 500);
  return {
    username: cap(c.name || DEFAULT.name, 80), ...(c.avatar ? { avatar_url: c.avatar } : {}), allowed_mentions: { parse: [] as string[] },
    ...(c.embed ? { embeds: [{ title: "🎉 Newly authorized", description: line, color: parseInt(c.color.slice(1), 16) || 0, fields: [{ name: "Tool", value: cap(escMd(v.tool), 1024), inline: true }] }] } : { content: line }),
  };
}

async function post(url: string, body: unknown) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(10_000) });
    return { status: r.status, retry: Number(r.headers.get("retry-after")) || 0 };
  } catch (e) { return { status: 0, retry: 0, err: (e as Error)?.name === "TimeoutError" ? "timed out" : "network error" }; } // never the error text: it can carry the URL
}

/** Called after a sign-off has committed. Queues one post (with a short random delay) when the integration is on and the member opted in; never throws. */
export async function queueAnnouncement(userId: number, certId: number, tool: string) {
  try {
    const c = await load();
    if (!c.enabled || !c.webhook) return;
    const pool = await conn();
    if (!(await pool.query("SELECT 1 FROM site_users WHERE id = $1 AND discord_announce <> ''", [userId])).rowCount) return;
    // The marker and the outbox row go in together, so a failed insert can't leave a marker that blocks every retry.
    await withTx(async (c) => {
      if ((await c.query("INSERT INTO training_mail_log (key) VALUES ($1) ON CONFLICT DO NOTHING", [`discord:${certId}`])).rowCount) // one post per sign-off
        await c.query("INSERT INTO outbox (kind, payload, next_at) VALUES ('discord', $1, now() + $2 * interval '1 second')", [JSON.stringify({ userId, certId, tool }), Math.floor(Math.random() * 60)]);
    });
  } catch (e) { console.error("discord queue failed:", String((e as Error)?.message ?? e)); }
}

const nameFor = (u: { discord_announce: string; first_name: string; name: string; discord: string }) => {
  const first = u.first_name || u.name.split(" ")[0] || "A member";
  return u.discord_announce === "full" && u.discord ? `${first} (${u.discord})` : first;
};

/** Sends what is due: a 429 waits as long as Discord says without using a try, errors back off, a dead webhook switches the integration off and tells the leads. Runs every minute. */
export async function drainDiscord() {
  const c = await load();
  if (!c.enabled || !c.webhook) return 0;
  const pool = await conn(), url = openText(c.webhook);
  const due = (await pool.query("SELECT id, payload, tries FROM outbox WHERE kind = 'discord' AND sent_at IS NULL AND tries < $1 AND next_at <= now() ORDER BY id LIMIT 25", [MAX_TRIES])).rows;
  const done = (id: number, note = "") => pool.query("UPDATE outbox SET sent_at = now(), last_error = $2 WHERE id = $1", [id, note]);
  const people = new Map<number, any>();
  for (const r of due) { // consent is checked now, so withdrawing before the send stops the post
    const u = (await pool.query("SELECT discord_announce, first_name, name, discord FROM site_users WHERE id = $1", [r.payload.userId])).rows[0];
    if (!u?.discord_announce) await done(r.id, "member opted out"); else people.set(r.id, u);
  }
  const live = due.filter((r) => people.has(r.id));
  const bulk = live.length > 5; // a rollout re-pass shouldn't flood the channel: one line for all of them
  const batches = bulk ? [{ ids: live.map((r) => r.id), tries: 0, body: buildPayload({ ...c, templates: [`${live.length} members were authorized on new tools today. Congratulations, everyone!`] }, { name: "", tool: "" }) }]
    : live.map((r) => ({ ids: [r.id], tries: r.tries, body: buildPayload(c, { name: nameFor(people.get(r.id)), tool: String(r.payload.tool ?? "") }) }));
  let sent = 0;
  for (const b of batches) {
    const res = await post(url, b.body);
    if (res.status >= 200 && res.status < 300) { for (const id of b.ids) await done(id); sent += b.ids.length; continue; }
    if (res.status === 401 || res.status === 404) { // the webhook was deleted or revoked
      await pool.query("UPDATE outbox SET tries = $2, last_error = 'webhook revoked' WHERE id = ANY($1)", [b.ids, MAX_TRIES]);
      await store({ enabled: false });
      await emitLeads("lead.discord_revoked", new Date().toISOString().slice(0, 10), {});
      return sent;
    }
    if (res.status === 429) { await pool.query("UPDATE outbox SET next_at = now() + $2 * interval '1 second', last_error = 'rate limited' WHERE id = ANY($1)", [b.ids, Math.min(Math.max(res.retry, 1), 600)]); break; }
    const err = res.err ?? `HTTP ${res.status}`;
    await pool.query("UPDATE outbox SET tries = tries + 1, last_error = $2, next_at = now() + (power(2, tries + 1) * interval '1 minute') WHERE id = ANY($1)", [b.ids, err]);
  }
  return sent;
}

export async function testPost() {
  const c = await load();
  if (!c.webhook) throw new Error("Add a webhook first.");
  const r = await post(openText(c.webhook), buildPayload(c, { name: "Sample Member", tool: "Sample tool" }));
  if (r.status < 200 || r.status >= 300) throw new Error(r.err ?? `Discord answered HTTP ${r.status}.`);
  return { ok: true };
}

export async function recentSends() {
  return (await (await conn()).query("SELECT id, created_at, sent_at, tries, last_error, payload->>'tool' AS tool FROM outbox WHERE kind = 'discord' ORDER BY id DESC LIMIT 20")).rows
    .map((r) => ({ id: r.id, at: r.created_at, tool: r.tool, status: r.sent_at ? (r.last_error ? "skipped" : "sent") : r.tries >= MAX_TRIES ? "failed" : "waiting", error: r.last_error }));
}
