import { debugLog, tracedFetch } from "./debug";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { randomBytes, randomUUID } from "crypto";
import { clickOk, same, sign } from "./signing";
import { engagement, type Touch } from "./mail-track";
import { applyOnce, db, withLock, withTx } from "./db";
import { openText, sealText } from "./vault";
import { hit } from "./limit";
import { backoffMinutes, MAX_MAIL_TRIES } from "./rules";
import { cleanDesign, fill, renderEmail, TEMPLATES, type Design } from "./mail-render";

// ---- settings (settings table, key "mail:config"; edited on /mailadmin/settings)
// shortcut: secrets are stored in plaintext in the database like the rest of the app's config; encrypt if the DB is ever shared.
export type MailCfg = {
  fromName: string; from: string; replyTo: string; siteUrl: string; smtp2goKey: string; smtpUrl: string; deepseekKey: string; aiModel: string;
  doubleOptIn: boolean; confirmSubject: string; confirmBody: string;
  welcomeOn: boolean; welcomeSubject: string; welcomeBody: string; perMinute: number; perDay: number;
  trackOpens: boolean; trackClicks: boolean;
};
const EMPTY: MailCfg = {
  fromName: "", from: "", replyTo: "", siteUrl: "", smtp2goKey: "", smtpUrl: "", deepseekKey: "", aiModel: "",
  doubleOptIn: true, confirmSubject: "Confirm your subscription", confirmBody: "Hello!\n\nPlease confirm your subscription by clicking this link:\n\n{{link}}\n\nIf you didn't ask for this, you can ignore this email.",
  welcomeOn: false, welcomeSubject: "Welcome!", welcomeBody: "Hi {{name}},\n\nThanks for subscribing. We'll be in touch with news and events.", perMinute: 0, perDay: 0, trackOpens: true, trackClicks: true,
};
const SECRETS = ["smtp2goKey", "smtpUrl", "deepseekKey"] as const;
export const getMailCfg = async (): Promise<MailCfg> => {
  const c: MailCfg = { ...EMPTY, ...(await q("SELECT data FROM settings WHERE key='mail:config'"))[0]?.data };
  for (const k of SECRETS) c[k] = openText(c[k]); // encrypted at rest (lib/vault.ts)
  return c;
};
export const mailReady = (c: MailCfg) => !!(c.smtp2goKey || c.smtpUrl) && !!c.from;
/** For the admin screen: secrets are never sent back to the browser, only whether they are set. */
export async function publicMailCfg() {
  const c = await getMailCfg();
  return { ...c, ...Object.fromEntries(SECRETS.map((k) => [k, ""])), webhookKey: await webhookKey(), isSet: Object.fromEntries(SECRETS.map((k) => [k, !!c[k]])), mail: mailReady(c), ai: !!c.deepseekKey };
}
/** A blank secret means "keep what is stored"; "-" clears it. */
export async function saveMailCfg(x: Partial<MailCfg>) {
  const old = await getMailCfg(), n: any = { ...old };
  for (const k of Object.keys(EMPTY) as (keyof MailCfg)[]) {
    if (x[k] === undefined) continue; // fields you don't send keep their value
    if (k === "doubleOptIn" || k === "welcomeOn" || k === "trackOpens" || k === "trackClicks") { n[k] = !!x[k]; continue; }
    if (k === "perMinute") { n.perMinute = Math.min(6000, Math.max(0, Math.floor(Number(x.perMinute)) || 0)); continue; }
    if (k === "perDay") { n.perDay = Math.min(1_000_000, Math.max(0, Math.floor(Number(x.perDay)) || 0)); continue; }
    const raw = String(x[k] ?? ""), v = (k === "confirmBody" || k === "welcomeBody" ? raw : raw.trim()).slice(0, 2000);
    if ((SECRETS as readonly string[]).includes(k)) { if (v) n[k] = v === "-" ? "" : v; } else n[k] = v;
  }
  if (n.from && !EMAIL_OK.test(n.from)) throw new Error("The From address must be just an email address, like news@example.org");
  if (n.replyTo && !EMAIL_OK.test(n.replyTo)) throw new Error("The reply-to address doesn't look right");
  if (n.siteUrl && !/^https?:\/\/[^/\s]+$/.test(n.siteUrl.replace(/\/$/, ""))) throw new Error("Site address must look like https://example.org");
  if (!n.confirmBody.includes("{{link}}")) throw new Error("The confirmation email must contain {{link}}");
  n.siteUrl = n.siteUrl.replace(/\/$/, "");
  await q("INSERT INTO settings (key, data) VALUES ('mail:config', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ ...n, ...Object.fromEntries(SECRETS.map((k) => [k, sealText(n[k])])) })]);
}
// Emailed links must point at our own site, never at a Host header the requester chose: use the saved site URL (or SITE_URL); only a local dev server may fall back to the request.
export const baseUrl = async (req: Request) => {
  const u = (await getMailCfg().catch(() => EMPTY)).siteUrl || process.env.SITE_URL;
  if (u) return u.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("The site address isn't set: an admin needs to save the Site URL in the mail Settings.");
  return new URL(req.url).origin;
};
const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

// ---- database
let ready: Promise<void> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= init(d.pool).catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}
const q = async (sql: string, args: unknown[] = []) => (await (await conn()).query(sql, args)).rows;

async function init(p: import("pg").Pool) {
  const run = (s: string) => p.query(s);
  await run(`CREATE TABLE IF NOT EXISTS mail_lists (id serial PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
  await run(`CREATE TABLE IF NOT EXISTS mail_subscribers (id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'subscribed', token text NOT NULL, trashed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`);
  await run("ALTER TABLE mail_subscribers ADD COLUMN IF NOT EXISTS trashed boolean NOT NULL DEFAULT false");
  for (const col of ["consent_at timestamptz", "consent_ip text NOT NULL DEFAULT ''", "consent_source text NOT NULL DEFAULT ''", "confirmed_at timestamptz", "unsub_reason text NOT NULL DEFAULT ''",
    "tags text[] NOT NULL DEFAULT '{}'", "welcomed boolean NOT NULL DEFAULT false"]) await run("ALTER TABLE mail_subscribers ADD COLUMN IF NOT EXISTS " + col);
  await run(`CREATE TABLE IF NOT EXISTS mail_memberships (subscriber_id int REFERENCES mail_subscribers ON DELETE CASCADE,
    list_id int REFERENCES mail_lists ON DELETE CASCADE, PRIMARY KEY (subscriber_id, list_id))`);
  await run(`CREATE TABLE IF NOT EXISTS mail_campaigns (id serial PRIMARY KEY, name text NOT NULL, subject text NOT NULL DEFAULT '', preview text NOT NULL DEFAULT '',
    design jsonb NOT NULL, list_ids int[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft', total int NOT NULL DEFAULT 0, sent int NOT NULL DEFAULT 0,
    failed int NOT NULL DEFAULT 0, sent_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`);
  for (const col of ["sender_name text NOT NULL DEFAULT ''", "sender_address text NOT NULL DEFAULT ''", "reply_to text NOT NULL DEFAULT ''", "scheduled_at timestamptz", "base text NOT NULL DEFAULT ''", "trashed boolean NOT NULL DEFAULT false", "tags text[] NOT NULL DEFAULT '{}'"])
    await run("ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS " + col);
  // One row per recipient: delivery state plus open/click tracking.
  await run(`CREATE TABLE IF NOT EXISTS mail_sends (id serial PRIMARY KEY, campaign_id int NOT NULL REFERENCES mail_campaigns ON DELETE CASCADE,
    subscriber_id int NOT NULL REFERENCES mail_subscribers ON DELETE CASCADE, token text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending',
    sent_at timestamptz, opened_at timestamptz, clicks int NOT NULL DEFAULT 0)`);
  await run("ALTER TABLE mail_sends ADD COLUMN IF NOT EXISTS opens int NOT NULL DEFAULT 0");
  await run("ALTER TABLE mail_sends ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz");
  await run("CREATE INDEX IF NOT EXISTS mail_sends_campaign ON mail_sends (campaign_id, status)");
  await run(`CREATE TABLE IF NOT EXISTS mail_clicks (id serial PRIMARY KEY, campaign_id int NOT NULL REFERENCES mail_campaigns ON DELETE CASCADE, url text NOT NULL, at timestamptz NOT NULL DEFAULT now())`);
  await run("ALTER TABLE mail_clicks ADD COLUMN IF NOT EXISTS send_id int REFERENCES mail_sends ON DELETE CASCADE");
  // Outgoing one-off emails that failed (or were queued in bulk): retried with exponential backoff, see sendQueued.
  await run("CREATE TABLE IF NOT EXISTS mail_queue (id serial PRIMARY KEY, msg jsonb NOT NULL, tries int NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), last_error text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())");
  await run("CREATE TABLE IF NOT EXISTS mail_templates (id serial PRIMARY KEY, name text NOT NULL, design jsonb NOT NULL)");
  await run(`CREATE TABLE IF NOT EXISTS mail_forms (id serial PRIMARY KEY, name text NOT NULL, kind text NOT NULL DEFAULT 'popup', enabled boolean NOT NULL DEFAULT true,
    lists int[] NOT NULL DEFAULT '{}', heading text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', button text NOT NULL DEFAULT 'Subscribe', success text NOT NULL DEFAULT '',
    delay int NOT NULL DEFAULT 8, color text NOT NULL DEFAULT '#2f6fed', ask_name boolean NOT NULL DEFAULT false)`);
  // One send row per recipient per campaign (a start interrupted and repeated used to add the audience twice), lookups for cascades/joins, and valid statuses.
  await applyOnce(p, "2026-11-08-mail-integrity", [
    "DELETE FROM mail_sends a USING mail_sends b WHERE a.campaign_id = b.campaign_id AND a.subscriber_id = b.subscriber_id AND a.id > b.id",
    "CREATE UNIQUE INDEX IF NOT EXISTS mail_sends_campaign_subscriber ON mail_sends (campaign_id, subscriber_id)",
    "CREATE INDEX IF NOT EXISTS mail_sends_subscriber ON mail_sends (subscriber_id)",
    "CREATE INDEX IF NOT EXISTS mail_memberships_list ON mail_memberships (list_id, subscriber_id)",
    "CREATE INDEX IF NOT EXISTS mail_clicks_campaign ON mail_clicks (campaign_id)",
    "ALTER TABLE mail_subscribers ADD CONSTRAINT mail_subscribers_status CHECK (status IN ('subscribed','unconfirmed','unsubscribed','bounced','complained')) NOT VALID",
    "ALTER TABLE mail_campaigns ADD CONSTRAINT mail_campaigns_status CHECK (status IN ('draft','scheduled','sending','sent')) NOT VALID",
  ]);
  // First start: one list and one site popup, so signup works immediately.
  if (!(await p.query("SELECT 1 FROM mail_lists")).rowCount) {
    const l = (await p.query("INSERT INTO mail_lists (name, description) VALUES ('General updates', 'News and events from the makerspace') RETURNING id")).rows[0].id;
    await p.query("INSERT INTO mail_forms (name, lists, heading, body, success) VALUES ('Website popup', $1, 'Stay in the loop', 'Get news and events from Kzoo Makers in your inbox.', 'You''re on the list. Thank you!')", [[l]]);
  }
}

// ---- lists
export const getLists = () => q(`SELECT l.id, l.name, l.description, l.created_at,
  count(*) FILTER (WHERE s.status = 'subscribed' AND NOT s.trashed)::int AS subscribed, count(*) FILTER (WHERE s.status = 'unconfirmed' AND NOT s.trashed)::int AS unconfirmed,
  count(*) FILTER (WHERE s.status = 'unsubscribed' AND NOT s.trashed)::int AS unsubscribed
  FROM mail_lists l LEFT JOIN mail_memberships m ON m.list_id = l.id LEFT JOIN mail_subscribers s ON s.id = m.subscriber_id GROUP BY l.id ORDER BY l.id`);
export async function saveList(l: { id?: number; name: string; description?: string }) {
  const name = String(l.name ?? "").trim().slice(0, 100);
  if (!name) throw new Error("A list needs a name");
  const d = String(l.description ?? "").slice(0, 300);
  if (l.id) await q("UPDATE mail_lists SET name=$2, description=$3 WHERE id=$1", [l.id, name, d]);
  else await q("INSERT INTO mail_lists (name, description) VALUES ($1,$2)", [name, d]);
}
export const deleteList = (id: number) => q("DELETE FROM mail_lists WHERE id=$1", [id]);

// ---- signup forms
const FORM_KINDS = ["popup", "slidein", "bar", "inline"];
export const getForms = () => q("SELECT * FROM mail_forms ORDER BY id");
export async function saveForm(f: any) {
  const name = String(f.name ?? "").trim().slice(0, 100);
  if (!name) throw new Error("A form needs a name");
  const v = [name, FORM_KINDS.includes(f.kind) ? f.kind : "popup", !!f.enabled, (f.lists ?? []).map(Number).filter(Boolean), String(f.heading ?? "").slice(0, 200), String(f.body ?? "").slice(0, 500),
    String(f.button ?? "").slice(0, 40) || "Subscribe", String(f.success ?? "").slice(0, 300), Math.min(120, Math.max(0, Number(f.delay) || 0)), /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : "#2f6fed", !!f.ask_name];
  if (f.enabled && !v[3].length) throw new Error("Choose at least one list for this form to subscribe people to");
  const cols = "name=$2, kind=$3, enabled=$4, lists=$5, heading=$6, body=$7, button=$8, success=$9, delay=$10, color=$11, ask_name=$12";
  if (f.id) await q(`UPDATE mail_forms SET ${cols} WHERE id=$1`, [f.id, ...v]);
  else await q("INSERT INTO mail_forms (name, kind, enabled, lists, heading, body, button, success, delay, color, ask_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", v);
}
export const deleteForm = (id: number) => q("DELETE FROM mail_forms WHERE id=$1", [id]);
/** What the public site needs to draw the enabled forms (never the list ids). */
export const publicForms = () => q("SELECT id, kind, heading, body, button, success, delay, color, ask_name FROM mail_forms WHERE enabled ORDER BY id");

// ---- subscribers
const PAGE = 50;
const STATUSES = ["subscribed", "unconfirmed", "unsubscribed", "bounced", "complained"];
// shortcut: "inactive" = got 3+ emails and never opened one (ever, not a recent window); upgrade to a time window if the list is long-lived.
const INACTIVE = `s.status = 'subscribed' AND (SELECT count(*) FROM mail_sends x WHERE x.subscriber_id = s.id AND x.status = 'sent') >= 3
  AND NOT EXISTS (SELECT 1 FROM mail_sends x WHERE x.subscriber_id = s.id AND x.opened_at IS NOT NULL)`;
export type SubFilter = { status?: string; list?: number; search?: string; page?: number; tag?: string };

function subWhere(f: SubFilter, args: unknown[]) {
  const w: string[] = [];
  if (f.list) { args.push(f.list); w.push(`s.id IN (SELECT subscriber_id FROM mail_memberships WHERE list_id = $${args.length})`); }
  if (f.search?.trim()) { args.push("%" + f.search.trim().replace(/[%_\\]/g, "\\$&") + "%"); w.push(`(s.email ILIKE $${args.length} OR s.name ILIKE $${args.length})`); }
  if (f.tag) { args.push(f.tag); w.push(`$${args.length} = ANY(s.tags)`); }
  return w;
}
export async function querySubscribers(f: SubFilter) {
  const a1: unknown[] = [], base = subWhere(f, a1);
  const counts = (await q(`SELECT count(*) FILTER (WHERE NOT s.trashed)::int AS "all", count(*) FILTER (WHERE s.status='subscribed' AND NOT s.trashed)::int AS subscribed,
    count(*) FILTER (WHERE s.status='unconfirmed' AND NOT s.trashed)::int AS unconfirmed, count(*) FILTER (WHERE s.status='unsubscribed' AND NOT s.trashed)::int AS unsubscribed,
    count(*) FILTER (WHERE s.status='bounced' AND NOT s.trashed)::int AS bounced, count(*) FILTER (WHERE s.status='complained' AND NOT s.trashed)::int AS complained,
    count(*) FILTER (WHERE NOT s.trashed AND ${INACTIVE})::int AS inactive, count(*) FILTER (WHERE s.trashed)::int AS trash FROM mail_subscribers s ${base.length ? "WHERE " + base.join(" AND ") : ""}`, a1))[0];
  const w = [...base];
  if (f.status === "trash") w.push("s.trashed"); else { w.push("NOT s.trashed"); if (f.status === "inactive") w.push(INACTIVE); else if (STATUSES.includes(f.status ?? "")) { a1.push(f.status); w.push(`s.status = $${a1.length}`); } }
  const total = f.status === "trash" ? counts.trash : f.status === "inactive" || STATUSES.includes(f.status ?? "") ? counts[f.status!] : counts.all;
  const rows = await q(`SELECT s.id, s.email, s.name, s.status, s.trashed, s.created_at, s.tags, s.consent_at, s.consent_ip, s.consent_source, s.confirmed_at, s.unsub_reason, COALESCE((SELECT array_agg(list_id) FROM mail_memberships WHERE subscriber_id = s.id), '{}') AS lists
    FROM mail_subscribers s WHERE ${w.join(" AND ")} ORDER BY s.id DESC LIMIT ${PAGE} OFFSET ${Math.max(0, Number(f.page) || 0) * PAGE}`, a1);
  return { rows, counts, total, pages: Math.ceil(total / PAGE) };
}

async function upsert(email: string, name: string, lists: number[], status: string, source = "") {
  if (!EMAIL_OK.test(email) || email.length > 200) throw new Error("That email address doesn't look right");
  const [s] = await q(`INSERT INTO mail_subscribers (email, name, status, token, consent_at, consent_source) VALUES ($1,$2,$3,$4,now(),$5)
    ON CONFLICT (email) DO UPDATE SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE mail_subscribers.name END
    RETURNING id, status, token`, [email.toLowerCase(), name.slice(0, 100), status, randomUUID(), source]);
  for (const l of lists) await q("INSERT INTO mail_memberships VALUES ($1,$2) ON CONFLICT DO NOTHING", [s.id, l]);
  return s as { id: number; status: string; token: string };
}
/** The id of a system list, created on first use. */
async function listIdFor(key: string, list: string, desc: string) {
  let id = (await q("SELECT data FROM settings WHERE key = $1", [key]))[0]?.data?.id;
  if (!id || !(await q("SELECT 1 FROM mail_lists WHERE id = $1", [id])).length) {
    id = (await q("INSERT INTO mail_lists (name, description) VALUES ($1, $2) RETURNING id", [list, desc]))[0].id;
    await q("INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [key, JSON.stringify({ id })]);
  }
  return id as number;
}
/**
 * A reader who just verified their email joins the "Registered users" list (created on first use). Existing status is never touched,
 * so someone who unsubscribed (or bounced) stays unsubscribed; they simply appear on the list.
 */
async function joinList(key: string, list: string, desc: string, source: string, email: string, name: string) {
  const s = await upsert(email, name, [await listIdFor(key, list, desc)], "subscribed", source);
  await q("UPDATE mail_subscribers SET confirmed_at = COALESCE(confirmed_at, now()) WHERE id = $1 AND status = 'subscribed'", [s.id]);
  return s;
}
// The list members opt into from the handbook page ("Notify me by email of updates"). Update emails are campaigns sent to it (lib/handbook.ts).
const HB = ["mail:handbook_list", "Request Handbook Updates", "Signed-in people who asked to be emailed when the member handbook changes"] as const;
export const handbookListId = () => listIdFor(...HB);
export async function handbookSubscribed(email: string) {
  const id = (await q("SELECT data FROM settings WHERE key = $1", [HB[0]]))[0]?.data?.id;
  return !!id && (await q("SELECT 1 FROM mail_memberships m JOIN mail_subscribers s ON s.id = m.subscriber_id WHERE m.list_id = $1 AND s.email = $2 AND s.status = 'subscribed' AND NOT s.trashed", [id, email.toLowerCase()])).length > 0;
}
/** Subscribers who will get the next handbook update email. */
export async function handbookAudience() {
  const id = (await q("SELECT data FROM settings WHERE key = $1", [HB[0]]))[0]?.data?.id;
  return id ? (await q("SELECT count(*)::int AS n FROM mail_memberships m JOIN mail_subscribers s ON s.id = m.subscriber_id WHERE m.list_id = $1 AND s.status = 'subscribed' AND NOT s.trashed", [id]))[0].n as number : 0;
}
/** The person's own click: on adds them to the list (an explicit ask also re-subscribes someone who had unsubscribed; bounced addresses can't be), off removes them from this list only. */
export async function setHandbookUpdates(email: string, name: string, on: boolean) {
  email = email.trim().toLowerCase();
  if (!on) { await q("DELETE FROM mail_memberships WHERE list_id = (SELECT (data->>'id')::int FROM settings WHERE key = $1) AND subscriber_id = (SELECT id FROM mail_subscribers WHERE email = $2)", [HB[0], email]); return; }
  const cur = (await q("SELECT status FROM mail_subscribers WHERE email = $1", [email]))[0];
  if (cur && (cur.status === "bounced" || cur.status === "complained")) throw new Error("Emails to this address have bounced, so we can't add it. Change your email address on your account page first.");
  const s = await joinList(...HB, "handbook", email, name);
  await q("UPDATE mail_subscribers SET status = 'subscribed', trashed = false, confirmed_at = COALESCE(confirmed_at, now()) WHERE id = $1 AND status IN ('unsubscribed', 'unconfirmed')", [s.id]);
}
export async function addRegistered(email: string, name: string, base: string) {
  void welcome((await joinList("mail:registered_list", "Registered users", "People who registered an account on the website", "registration", email, name)).token, base);
}
/** Approved, waiver signed, ID uploaded and profile complete: joins the "Members" list (unsubscribed stays unsubscribed). */
export const addMember = (email: string, name: string) => joinList("mail:members_list", "Members", "Approved members who finished onboarding", "onboarding", email, name);
/** Admin add/edit of one person. Admin-added people skip the confirmation email. */
const cleanTags = (t: unknown) => [...new Set((Array.isArray(t) ? t : String(t ?? "").split(",")).map((x) => String(x).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 20);
export async function saveSubscriber(x: { id?: number; email: string; name?: string; status?: string; lists?: number[]; tags?: unknown }) {
  const status = STATUSES.includes(x.status ?? "") ? x.status! : "subscribed", lists = (x.lists ?? []).map(Number).filter(Boolean), email = String(x.email ?? "").trim().toLowerCase();
  if (!EMAIL_OK.test(email)) throw new Error("That email address doesn't look right");
  if (x.id) {
    await q("UPDATE mail_subscribers SET email=$2, name=$3, status=$4, tags=$5 WHERE id=$1", [x.id, email, String(x.name ?? "").slice(0, 100), status, cleanTags(x.tags)]);
    await q("DELETE FROM mail_memberships WHERE subscriber_id=$1", [x.id]);
    for (const l of lists) await q("INSERT INTO mail_memberships VALUES ($1,$2) ON CONFLICT DO NOTHING", [x.id, l]);
  } else {
    const s = await upsert(email, String(x.name ?? ""), lists, status, "admin");
    await q("UPDATE mail_subscribers SET status=$2, trashed=false, tags=$3 WHERE id=$1", [s.id, status, cleanTags(x.tags)]);
  }
}
/** Import: one per line, `email` or `Name, email` (or a CSV with the email anywhere on the line). */
export async function addSubscribers(text: string, lists: number[], status = "subscribed") {
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/);
    if (!m) continue;
    const s = await upsert(m[0], line.replace(m[0], "").replace(/[,;<>"]/g, " ").trim(), lists, STATUSES.includes(status) ? status : "subscribed", "import");
    await q("UPDATE mail_subscribers SET trashed=false WHERE id=$1", [s.id]); n++;
  }
  return n;
}
export async function bulkSubscribers(ids: number[], action: string, list?: number, tag?: string) {
  ids = ids.map(Number).filter(Boolean);
  if (!ids.length) return;
  switch (action) {
    case "addToList": if (list) for (const id of ids) await q("INSERT INTO mail_memberships VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, list]); break;
    case "removeFromList": await q("DELETE FROM mail_memberships WHERE list_id=$1 AND subscriber_id = ANY($2)", [list, ids]); break;
    case "addTag": case "removeTag": {
      const t = cleanTags(tag);
      if (!t.length) throw new Error("Type a tag first");
      await q(action === "addTag" ? "UPDATE mail_subscribers SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(tags || $2::text[]) x) WHERE id = ANY($1)"
        : "UPDATE mail_subscribers SET tags = array_remove(tags, $2) WHERE id = ANY($1)", [ids, action === "addTag" ? t : t[0]]); break;
    }
    case "unsubscribe": await q("UPDATE mail_subscribers SET status='unsubscribed' WHERE id = ANY($1)", [ids]); break;
    case "trash": await q("UPDATE mail_subscribers SET trashed=true WHERE id = ANY($1)", [ids]); break;
    case "restore": await q("UPDATE mail_subscribers SET trashed=false WHERE id = ANY($1)", [ids]); break;
    case "delete": await q("DELETE FROM mail_subscribers WHERE trashed AND id = ANY($1)", [ids]); break;
    default: throw new Error("unknown action");
  }
}
export async function exportSubscribers(f: SubFilter) {
  const lists = new Map((await q("SELECT id, name FROM mail_lists")).map((l) => [l.id, l.name]));
  const cell = (v: string) => (/^[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""'); // leading = + - @ would run as a formula in Excel
  const all: any[] = [];
  for (let p = 0, r; (r = await querySubscribers({ ...f, page: p })).rows.length; p++) { all.push(...r.rows); if (p + 1 >= r.pages) break; }
  return "email,name,status,lists,tags,consent_at,consent_source\n" + all.map((r) => [r.email, r.name, r.status, r.lists.map((i: number) => lists.get(i)).filter(Boolean).join("; "), r.tags.join("; "), r.consent_at ? new Date(r.consent_at).toISOString() : "", r.consent_source].map((v) => `"${cell(String(v))}"`).join(",")).join("\n");
}

/** Public signup through a form. With double opt-in on (and sending set up) nobody can sign up someone else's address. */
export async function publicSubscribe(formId: number, email: string, name: string, base: string, ip: string) {
  // Per address too: otherwise anyone can make us email a stranger's inbox over and over (confirmation mail).
  if (!(await hit("sub:ip:" + ip, 5, 600_000)) || !(await hit("sub:em:" + email.toLowerCase(), 3, 3600_000))) throw new Error("Too many attempts, please try again later");
  const form = (await q("SELECT lists, success FROM mail_forms WHERE enabled AND id=$1", [formId]))[0];
  const ok = form ? (await q("SELECT id FROM mail_lists WHERE id = ANY($1)", [form.lists])).map((r) => r.id as number) : [];
  if (!ok.length) throw new Error("This form isn't available");
  const s = await upsert(email, name, ok, "unconfirmed", "form " + formId);
  await q("UPDATE mail_subscribers SET trashed=false, consent_at=now(), consent_ip=$2, consent_source=$3 WHERE id=$1", [s.id, ip.slice(0, 64), "form " + formId]);
  if (s.status === "subscribed") return "subscribed";
  if (s.status === "bounced" || s.status === "complained") return "subscribed"; // never re-enable these; look the same so nobody can probe who bounced
  const cfg = await getMailCfg();
  if (!cfg.doubleOptIn || !mailReady(cfg)) { await q("UPDATE mail_subscribers SET status='subscribed', confirmed_at=now() WHERE id=$1", [s.id]); void welcome(s.token, base); return "subscribed"; }
  await q("UPDATE mail_subscribers SET status='unconfirmed' WHERE id=$1", [s.id]);
  await sendQueued({ to: email, subject: cfg.confirmSubject, text: cfg.confirmBody.replace(/\{\{link\}\}/g, `${base}/mail/confirm?t=${s.token}`) }, cfg);
  return "confirm";
}

/** Confirm / unsubscribe by the secret per-subscriber token. */
export async function tokenAction(action: "confirm" | "unsubscribe", token: string, base: string, sendToken = "") {
  // Bounced/complained people stay blocked: a stray confirm link must not re-enable them.
  const r = await q(action === "confirm"
    ? "UPDATE mail_subscribers SET status='subscribed', confirmed_at=now() WHERE token=$1 AND status IN ('unconfirmed','subscribed','unsubscribed') RETURNING id"
    : "UPDATE mail_subscribers SET status='unsubscribed' WHERE token=$1 AND status IN ('unconfirmed','subscribed','unsubscribed') RETURNING id", [token]);
  if (action === "unsubscribe" && r.length && sendToken) await q("UPDATE mail_sends SET unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE token=$1 AND subscriber_id=$2", [sendToken, r[0].id]);
  if (action === "confirm" && r.length) void welcome(token, base);
  return !!r.length;
}
export const unsubReason = (token: string, reason: string) => q("UPDATE mail_subscribers SET unsub_reason=$2 WHERE token=$1", [token, reason.slice(0, 300)]);

/** Subscriber self-service: their name and which lists they are on. All lists are shown (shortcut: no per-list "public" flag; add one if list names are private). */
export async function getPrefs(token: string) {
  const s = (await q("SELECT id, name, status FROM mail_subscribers WHERE token=$1 AND NOT trashed", [token]))[0];
  if (!s) return null;
  const mine = new Set((await q("SELECT list_id FROM mail_memberships WHERE subscriber_id=$1", [s.id])).map((r) => r.list_id));
  return { name: s.name as string, status: s.status as string, lists: (await q("SELECT id, name FROM mail_lists ORDER BY id")).map((l) => ({ ...l, on: mine.has(l.id) })) };
}
export async function savePrefs(token: string, name: string, lists: number[]) {
  const s = (await q("SELECT id, status FROM mail_subscribers WHERE token=$1 AND NOT trashed", [token]))[0];
  if (!s) return false;
  await q("UPDATE mail_subscribers SET name=$2 WHERE id=$1", [s.id, name.slice(0, 100)]);
  await q("DELETE FROM mail_memberships WHERE subscriber_id=$1", [s.id]);
  await q("INSERT INTO mail_memberships SELECT $1, id FROM mail_lists WHERE id = ANY($2)", [s.id, lists]);
  // Picking lists after unsubscribing is a deliberate resubscribe; ticking nothing is leaving.
  if (s.status === "subscribed" && !lists.length) await q("UPDATE mail_subscribers SET status='unsubscribed' WHERE id=$1", [s.id]);
  if (s.status === "unsubscribed" && lists.length) await q("UPDATE mail_subscribers SET status='subscribed' WHERE id=$1", [s.id]);
  return true;
}

// ---- compliance: everything we hold about one person, and erasure
export async function exportPerson(id: number) {
  const s = (await q(`SELECT email, name, status, tags, created_at, consent_at, consent_ip, consent_source, confirmed_at, unsub_reason FROM mail_subscribers WHERE id=$1`, [id]))[0];
  if (!s) throw new Error("No such subscriber");
  return { subscriber: s, lists: (await q("SELECT l.name FROM mail_memberships m JOIN mail_lists l ON l.id = m.list_id WHERE m.subscriber_id=$1", [id])).map((r) => r.name), emails: await subscriberActivity(id) };
}
/** Permanent: removes the person with their memberships, sends and click records. */
export const erasePerson = (id: number) => q("DELETE FROM mail_subscribers WHERE id=$1", [id]);

/** One welcome email per person, the first time they become subscribed. */
async function welcome(token: string, base: string) {
  try {
    const cfg = await getMailCfg();
    if (!cfg.welcomeOn || !mailReady(cfg)) return;
    const s = (await q("UPDATE mail_subscribers SET welcomed=true WHERE token=$1 AND NOT welcomed AND status='subscribed' RETURNING email, name", [token]))[0];
    if (!s) return;
    const text = cfg.welcomeBody.replace(/\{\{name\}\}/g, s.name || "friend") + `\n\nManage your preferences: ${base}/mail/preferences?t=${token}\nUnsubscribe: ${base}/mail/unsubscribe?t=${token}`;
    await sendQueued({ to: s.email, subject: cfg.welcomeSubject, text, headers: { "List-Unsubscribe": `<${base}/mail/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }, cfg);
  } catch { /* a failed welcome must not break signup */ }
}

// ---- SMTP2GO webhook: hard bounces and spam complaints stop all future mail to that address
// Its own random key: it sits in a URL (SMTP2GO settings, logs), so it must not be the secret that signs click links.
async function webhookKey() {
  await q("INSERT INTO settings (key, data) VALUES ('mail:webhook_key', $1) ON CONFLICT DO NOTHING", [JSON.stringify({ v: randomBytes(24).toString("hex") })]);
  return (await q("SELECT data FROM settings WHERE key='mail:webhook_key'"))[0].data.v as string;
}
export async function webhookKeyOk(k: string) { return k.length > 0 && same(k, await webhookKey()); }
export async function handleWebhook(b: any) {
  const ev = String(b?.event ?? "").toLowerCase(), raw = String(b?.email ?? b?.rcpt ?? b?.recipient ?? ""), email = raw.match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase();
  if (!email) return;
  const status = ev === "spam" ? "complained" : ev === "bounce" && String(b.bounce ?? "hard").toLowerCase() !== "soft" ? "bounced" : ev === "unsubscribe" ? "unsubscribed" : "";
  if (status) await q("UPDATE mail_subscribers SET status=$2 WHERE email=$1", [email, status]);
}

// ---- templates
export const allTags = async () => (await q("SELECT DISTINCT unnest(tags) AS t FROM mail_subscribers ORDER BY 1")).map((r) => r.t as string);
export const getTemplates = async () => [...TEMPLATES.map((t, i) => ({ id: -1 - i, ...t })), ...(await q("SELECT id, name, design FROM mail_templates ORDER BY id"))];
export const saveTemplate = (name: string, design: unknown) => q("INSERT INTO mail_templates (name, design) VALUES ($1,$2)", [name.slice(0, 80) || "Template", JSON.stringify(cleanDesign(design))]);
export const deleteTemplate = (id: number) => q("DELETE FROM mail_templates WHERE id=$1", [id]);

// ---- dashboard
export async function dashboard() {
  const [t] = await q(`SELECT count(*) FILTER (WHERE s.status='subscribed')::int AS subscribed, count(*) FILTER (WHERE s.status='unconfirmed')::int AS unconfirmed,
    count(*) FILTER (WHERE s.status='unsubscribed')::int AS unsubscribed, count(*) FILTER (WHERE s.status='bounced')::int AS bounced, count(*) FILTER (WHERE s.status='complained')::int AS complained,
    count(*) FILTER (WHERE ${INACTIVE})::int AS inactive, count(*) FILTER (WHERE s.created_at > now() - interval '30 days')::int AS new30
    FROM mail_subscribers s WHERE NOT s.trashed`);
  const [u] = await q("SELECT count(*)::int AS n FROM mail_sends WHERE unsubscribed_at > now() - interval '30 days'");
  const recent = await q(`SELECT c.id, c.subject, c.sent_at, c.sent, (SELECT count(*)::int FROM mail_sends x WHERE x.campaign_id = c.id AND x.opened_at IS NOT NULL) AS opened,
    (SELECT count(*)::int FROM mail_sends x WHERE x.campaign_id = c.id AND x.clicks > 0) AS clicked, (SELECT count(*)::int FROM mail_sends x WHERE x.campaign_id = c.id AND x.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM mail_campaigns c WHERE c.status='sent' AND NOT c.trashed ORDER BY c.sent_at DESC LIMIT 5`);
  const next = await q("SELECT id, subject, scheduled_at FROM mail_campaigns WHERE status='scheduled' AND NOT trashed ORDER BY scheduled_at LIMIT 3");
  return { ...t, unsubscribed30: u.n, recent, next };
}

// ---- emails (campaigns)
export async function getCampaigns(f: { status?: string; search?: string }) {
  const args: unknown[] = [f.status === "trash"], w = ["c.trashed = $1"];
  if (["draft", "scheduled", "sending", "sent"].includes(f.status ?? "")) { args.push(f.status); w.push(`c.status = $${args.length}`); }
  if (f.search?.trim()) { args.push("%" + f.search.trim().replace(/[%_\\]/g, "\\$&") + "%"); w.push(`(c.name ILIKE $${args.length} OR c.subject ILIKE $${args.length})`); }
  const rows = await q(`SELECT c.id, c.name, c.subject, c.status, c.total, c.sent, c.failed, c.sent_at, c.scheduled_at, c.updated_at, c.list_ids,
    (SELECT count(*)::int FROM mail_sends x WHERE x.campaign_id = c.id AND x.opened_at IS NOT NULL) AS opened,
    (SELECT count(*)::int FROM mail_sends x WHERE x.campaign_id = c.id AND x.clicks > 0) AS clicked,
    (SELECT count(*)::int FROM mail_sends x WHERE x.campaign_id = c.id AND x.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM mail_campaigns c WHERE ${w.join(" AND ")} ORDER BY c.id DESC LIMIT 200`, args);
  const counts = (await q(`SELECT count(*) FILTER (WHERE NOT trashed)::int AS "all", count(*) FILTER (WHERE status='draft' AND NOT trashed)::int AS draft,
    count(*) FILTER (WHERE status='scheduled' AND NOT trashed)::int AS scheduled, count(*) FILTER (WHERE status='sending' AND NOT trashed)::int AS sending,
    count(*) FILTER (WHERE status='sent' AND NOT trashed)::int AS sent, count(*) FILTER (WHERE trashed)::int AS trash FROM mail_campaigns`))[0];
  // Sending newsletters stop at the daily limit and carry on after midnight; say so, or they look stuck.
  const cfg = counts.sending ? await getMailCfg() : null;
  const limitHit = !!cfg?.perDay && roomToday(cfg.perDay, await sentToday()) <= 0;
  return { rows, counts, limitHit };
}
export const getCampaign = async (id: number) => (await q("SELECT * FROM mail_campaigns WHERE id=$1", [id]))[0];

/** Creates or updates a draft. Only the fields you send change, so the editor and the send screen can each save their part. */
export async function saveCampaign(c: any) {
  const old = c.id ? await getCampaign(c.id) : null;
  if (c.id && !old) throw new Error("No such email");
  if (old && old.status !== "draft") throw new Error("Only drafts can be edited — duplicate it instead");
  const pick = (k: string, d: unknown) => (c[k] !== undefined ? c[k] : old?.[k] ?? d);
  const email = (k: string) => { const v = String(pick(k, "")).trim(); if (v && !EMAIL_OK.test(v)) throw new Error("That email address doesn't look right"); return v; };
  const v = [String(pick("name", "Untitled")).slice(0, 120) || "Untitled", String(pick("subject", "")).slice(0, 200), String(pick("preview", "")).slice(0, 200),
    JSON.stringify(cleanDesign(pick("design", { blocks: [] }))), (pick("list_ids", []) as unknown[]).map(Number).filter(Boolean),
    String(pick("sender_name", "")).replace(/[<>"\r\n]/g, "").slice(0, 100), email("sender_address"), email("reply_to"), cleanTags(pick("tags", []))];
  if (old) {
    await q("UPDATE mail_campaigns SET name=$2, subject=$3, preview=$4, design=$5, list_ids=$6, sender_name=$7, sender_address=$8, reply_to=$9, tags=$10, updated_at=now() WHERE id=$1", [old.id, ...v]);
    return old.id as number;
  }
  return (await q("INSERT INTO mail_campaigns (name, subject, preview, design, list_ids, sender_name, sender_address, reply_to, tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", v))[0].id as number;
}
export async function campaignAction(id: number, action: string) {
  const c = await getCampaign(id);
  if (!c) throw new Error("No such email");
  switch (action) {
    case "duplicate":
      return (await q(`INSERT INTO mail_campaigns (name, subject, preview, design, list_ids, sender_name, sender_address, reply_to, tags)
        SELECT 'Copy of ' || left(name, 100), subject, preview, design, list_ids, sender_name, sender_address, reply_to, tags FROM mail_campaigns WHERE id=$1 RETURNING id`, [id]))[0].id;
    case "trash": if (c.status === "sending") throw new Error("Wait for it to finish sending"); await q("UPDATE mail_campaigns SET trashed=true WHERE id=$1", [id]); break;
    case "restore": await q("UPDATE mail_campaigns SET trashed=false WHERE id=$1", [id]); break;
    case "delete": await q("DELETE FROM mail_campaigns WHERE id=$1 AND trashed", [id]); break;
    case "unschedule": await q("UPDATE mail_campaigns SET status='draft', scheduled_at=NULL WHERE id=$1 AND status='scheduled'", [id]); break;
    default: throw new Error("unknown action");
  }
}
export async function campaignStats(id: number) {
  const [s] = await q(`SELECT count(*) FILTER (WHERE status='sent')::int AS sent, count(*) FILTER (WHERE status='failed')::int AS failed, count(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
    count(*) FILTER (WHERE clicks > 0)::int AS clicked, count(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsubscribed FROM mail_sends WHERE campaign_id=$1`, [id]);
  const links = await q("SELECT url, count(*)::int AS clicks FROM mail_clicks WHERE campaign_id=$1 GROUP BY url ORDER BY clicks DESC LIMIT 20", [id]);
  return { ...s, links, campaign: (await q("SELECT id, name, subject, status FROM mail_campaigns WHERE id=$1", [id]))[0] };
}

/** Who got this email and what each person did with it. filter: opened | clicked | unopened. Capped at 500 rows. */
export const campaignRecipients = (id: number, filter = "") => q(`SELECT s.email, s.name, x.status, x.sent_at, x.opened_at, GREATEST(x.opens, CASE WHEN x.opened_at IS NULL THEN 0 ELSE 1 END) AS opens, x.clicks,
  (SELECT array_agg(DISTINCT url) FROM mail_clicks k WHERE k.send_id = x.id) AS urls
  FROM mail_sends x JOIN mail_subscribers s ON s.id = x.subscriber_id WHERE x.campaign_id = $1
  ${filter === "opened" ? "AND x.opened_at IS NOT NULL" : filter === "clicked" ? "AND x.clicks > 0" : filter === "unopened" ? "AND x.opened_at IS NULL AND x.status = 'sent'" : ""}
  ORDER BY x.opened_at DESC NULLS LAST, x.id LIMIT 500`, [id]);

/** Every email a person was sent, with whether and how often they opened it and which links they clicked. */
export const subscriberActivity = (subscriberId: number) => q(`SELECT c.id AS campaign_id, c.subject, x.status, x.sent_at, x.opened_at, GREATEST(x.opens, CASE WHEN x.opened_at IS NULL THEN 0 ELSE 1 END) AS opens, x.clicks,
  (SELECT array_agg(DISTINCT url) FROM mail_clicks k WHERE k.send_id = x.id) AS urls
  FROM mail_sends x JOIN mail_campaigns c ON c.id = x.campaign_id WHERE x.subscriber_id = $1 ORDER BY x.id DESC LIMIT 200`, [subscriberId]);

// ---- sending
let tx: { url: string; t: Transporter } | undefined;
const smtp = (c: MailCfg) => (tx?.url === c.smtpUrl ? tx : (tx = { url: c.smtpUrl, t: nodemailer.createTransport(c.smtpUrl) })).t;

type Msg = { to: string; subject: string; html?: string; text?: string; from?: string; headers?: Record<string, string>; attachments?: { filename: string; content: Buffer; type: string }[] };
const fromHeader = (name: string, addr: string) => (name ? `${name.replace(/[<>"\r\n]/g, "")} <${addr}>` : addr);
/** One send path: SMTP2GO's HTTP API when an SMTP2GO key is saved, otherwise plain SMTP. */
const TODAY = "(now() AT TIME ZONE 'America/Detroit')::date";
const sentToday = async () => (await q(`SELECT COALESCE((SELECT n FROM mail_daily WHERE day = ${TODAY}), 0)::int AS n`))[0].n as number;
/** How many more newsletter messages may go out today under the daily limit (Settings): `perDay` (0 = no limit) minus what was sent, never below 0. */
export const roomToday = (perDay: number, sent: number) => (perDay ? Math.max(0, perDay - sent) : Infinity);
/** Sends one message and counts it toward today's total (the guest notice trickle backs off as the day fills up). The daily limit does not apply here: sign-in links, resets and codes must go out. Newsletters honour it in work(). */
export async function send(m: Msg, c: MailCfg) {
  await sendRaw(m, c);
  await q("INSERT INTO mail_daily (day, n) VALUES ((now() AT TIME ZONE 'America/Detroit')::date, 1) ON CONFLICT (day) DO UPDATE SET n = mail_daily.n + 1").catch(() => {});
}
async function sendRaw(m: Msg, c: MailCfg) {
  const from = m.from ?? fromHeader(c.fromName, c.from), headers = { ...(c.replyTo ? { "Reply-To": c.replyTo } : {}), ...m.headers };
  if (!c.smtp2goKey) return void (await smtp(c).sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text, headers, attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.type })) }));
  const t0 = Date.now(), meta = { to: m.to, from, subject: m.subject, attachments: m.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`) };
  await debugLog("smtp2go", "send request", meta);
  let r: Response;
  try {
    r = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json", "X-Smtp2go-Api-Key": c.smtp2goKey },
      body: JSON.stringify({ sender: from, to: [m.to], subject: m.subject, html_body: m.html, text_body: m.text, attachments: m.attachments?.map((a) => ({ filename: a.filename, fileblob: a.content.toString("base64"), mimetype: a.type })),
        custom_headers: Object.entries(headers).map(([header, value]) => ({ header, value })) }),
    });
  } catch (e: any) { await debugLog("smtp2go", "network error", { ...meta, error: String(e?.message ?? e), ms: Date.now() - t0 }, "error"); throw e; }
  const j: any = await r.json().catch(() => ({})), ok = r.ok && j.data?.succeeded > 0;
  await debugLog("smtp2go", ok ? "accepted" : "REJECTED", { to: m.to, status: r.status, response: j, ms: Date.now() - t0 }, ok ? "info" : "error");
  if (!ok) throw new Error(j.data?.error ?? j.data?.failures?.[0] ?? "SMTP2GO rejected the message (" + r.status + ")");
}

// ---- retry queue
const pack = (m: Msg) => ({ ...m, attachments: m.attachments?.map((a) => ({ ...a, content: a.content.toString("base64") })) });
const unpack = (j: any): Msg => ({ ...j, attachments: j.attachments?.map((a: any) => ({ ...a, content: Buffer.from(a.content, "base64") })) });
/** Puts a message on the queue; the next tick delivers it, or `delayMin` minutes from now. */
export const enqueueMail = (m: Msg, tries = 0, error = "", delayMin = 0) =>
  q("INSERT INTO mail_queue (msg, tries, last_error, next_at) VALUES ($1,$2,$3, now() + make_interval(mins => $4))", [JSON.stringify(pack(m)), tries, error.slice(0, 300), delayMin]);
/** Like send, but a failure never reaches the caller: the message waits in the queue and is retried (2, 4, 8 ... minutes, up to MAX_MAIL_TRIES). */
export async function sendQueued(m: Msg, c: MailCfg) {
  await send(m, c).catch((e) => enqueueMail(m, 1, String(e?.message ?? e), backoffMinutes(1)));
}
/** Delivers what is due. A row is leased for 10 minutes while it is tried, so two servers never send the same message. */
async function flushQueue() {
  const rows = await q("UPDATE mail_queue SET next_at = now() + interval '10 minutes' WHERE id IN (SELECT id FROM mail_queue WHERE next_at <= now() AND tries < $1 ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED) RETURNING id, msg, tries", [MAX_MAIL_TRIES]);
  if (!rows.length) return;
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) return;
  for (const r of rows) {
    try { await send(unpack(r.msg), cfg); await q("DELETE FROM mail_queue WHERE id=$1", [r.id]); }
    catch (e: any) { await q("UPDATE mail_queue SET tries = tries + 1, last_error = $2, next_at = now() + make_interval(mins => $3) WHERE id=$1", [r.id, String(e?.message ?? e).slice(0, 300), backoffMinutes(r.tries + 1)]); }
  }
}
export const listQueue = () => q("SELECT id, msg->>'to' AS recipient, msg->>'subject' AS subject, tries, next_at, last_error, created_at, tries >= $1 AS gave_up FROM mail_queue ORDER BY id LIMIT 500", [MAX_MAIL_TRIES]);
/** Deletes the given messages, or every queued message when `ids` is omitted. */
export const dropQueued = async (ids?: number[]) => (ids ? await q("DELETE FROM mail_queue WHERE id = ANY($1) RETURNING id", [ids]) : await q("DELETE FROM mail_queue RETURNING id")).length;

// Signed click links: without the signature our /mail/click endpoint would be an open redirect.
async function secret() {
  await q("INSERT INTO settings (key, data) VALUES ('mail:secret', $1) ON CONFLICT DO NOTHING", [JSON.stringify({ v: randomBytes(32).toString("hex") })]);
  return (await q("SELECT data FROM settings WHERE key='mail:secret'"))[0].data.v as string;
}

function track(html: string, base: string, token: string, sec: string, on = { opens: true, clicks: true }) {
  const out = !on.clicks ? html : html.replace(/href="(https?:\/\/[^"]+)"/g, (m, u: string) => {
    const url = u.replace(/&amp;/g, "&");
    return url.startsWith(base + "/mail/") ? m : `href="${base}/mail/click?s=${token}&amp;u=${encodeURIComponent(url)}&amp;h=${sign(sec, token, url)}"`;
  });
  return !on.opens ? out : out.replace("</body>", `<img src="${base}/mail/open?s=${token}" width="1" height="1" alt="" style="display:block;border:0"></body>`);
}
export async function trackOpen(token: string) { await q("UPDATE mail_sends SET opened_at = COALESCE(opened_at, now()), opens = opens + 1 WHERE token=$1", [token]); }
/** Returns the destination if the signature is valid. */
export async function trackClick(token: string, url: string, sig: string) {
  if (!clickOk(await secret(), token, url, sig)) return null;
  const r = await q("UPDATE mail_sends SET clicks = clicks + 1, opened_at = COALESCE(opened_at, now()) WHERE token=$1 RETURNING id, campaign_id", [token]);
  if (r[0]) await q("INSERT INTO mail_clicks (campaign_id, send_id, url) VALUES ($1,$2,$3)", [r[0].campaign_id, r[0].id, url.slice(0, 1000)]);
  return url;
}

/** Plain-text twin of an email (spam filters score HTML-only mail worse). */
export function htmlToText(html: string) {
  return html.replace(/<(head|style)[\s\S]*?<\/\1>/gi, "").replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => { const x = t.replace(/<[^>]*>/g, "").trim(); return x && x !== h ? `${x} (${h})` : h; })
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr|hr)[^>]*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function deliver(cfg: MailCfg, c: any, s: { email: string; name: string; token: string }, base: string, o: { prefix?: string; sendToken?: string; sec?: string } = {}) {
  const unsub = `${base}/mail/unsubscribe?t=${s.token}` + (o.sendToken ? `&s=${o.sendToken}` : ""), prefs = `${base}/mail/preferences?t=${s.token}`;
  let html = fill(renderEmail(c.design as Design, base, c.preview), { name: s.name, unsubscribe: unsub, preferences: prefs });
  const text = htmlToText(html);
  if (o.sendToken) html = track(html, base, o.sendToken, o.sec!, { opens: cfg.trackOpens, clicks: cfg.trackClicks });
  await send({
    to: s.email, subject: (o.prefix ?? "") + c.subject, html, text,
    from: fromHeader(c.sender_name || cfg.fromName, c.sender_address || cfg.from),
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", ...(c.reply_to ? { "Reply-To": c.reply_to } : {}) },
  }, cfg);
}

export async function sendTest(id: number, to: string, base: string) {
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email sending isn't set up yet — add it under Settings");
  if (!EMAIL_OK.test(to)) throw new Error("That email address doesn't look right");
  const c = await getCampaign(id);
  if (!c) throw new Error("No such email");
  await deliver(cfg, c, { email: to, name: "Test", token: "test" }, base, { prefix: "[TEST] " });
}

const AUDIENCE = `SELECT DISTINCT s.id FROM mail_subscribers s JOIN mail_memberships m ON m.subscriber_id = s.id
  WHERE s.status = 'subscribed' AND NOT s.trashed AND m.list_id = ANY($2) AND (cardinality($3::text[]) = 0 OR s.tags && $3::text[])`;
const recipients = (c: any) => q(AUDIENCE.replace(/\$2/, "$1").replace(/\$3/g, "$2"), [c.list_ids, c.tags ?? []]);

/** Sends now, or (with `at`) schedules for later. The send screen has already saved subject, lists and sender. */
export async function sendCampaign(id: number, base: string, at?: string) {
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) throw new Error("Email sending isn't set up yet — add it under Settings");
  const c = await getCampaign(id);
  if (!c || c.status !== "draft") throw new Error("Only drafts can be sent");
  if (!c.subject.trim()) throw new Error("Add a subject first");
  if (!c.list_ids.length) throw new Error("Choose at least one list");
  if (!c.design.blocks?.length) throw new Error("The email is empty");
  const n = (await recipients(c)).length;
  if (!n) throw new Error("Those lists have no subscribers yet");
  if (at) {
    const t = new Date(at);
    if (isNaN(+t) || +t < Date.now() + 60_000) throw new Error("Pick a time at least a minute from now");
    await q("UPDATE mail_campaigns SET status='scheduled', scheduled_at=$2, base=$3 WHERE id=$1", [id, t, base]);
    return n;
  }
  await begin(id, base);
  return n;
}

async function begin(id: number, base: string) {
  const c = await getCampaign(id);
  // One transaction: a crash can't leave recipients added while the campaign still says "scheduled", and a repeat adds nobody twice (unique key).
  await withTx(async (t) => {
    await t.query(`INSERT INTO mail_sends (campaign_id, subscriber_id, token) SELECT $1, s.id, gen_random_uuid()::text FROM (${AUDIENCE}) s ON CONFLICT (campaign_id, subscriber_id) DO NOTHING`, [id, c.list_ids, c.tags ?? []]);
    const total = (await t.query("SELECT count(*)::int AS n FROM mail_sends WHERE campaign_id=$1", [id])).rows[0].n;
    await t.query("UPDATE mail_campaigns SET status='sending', total=$2, sent=0, failed=0, base=$3, scheduled_at=NULL WHERE id=$1", [id, total, base]);
  });
  void work(id);
}

const running = new Set<number>();
/** Delivers pending recipients in order. State lives in mail_sends, so a restart just resumes (see tick). */
async function work(id: number) {
  if (running.has(id)) return;
  running.add(id);
  try {
    await withLock(8_000_000 + id, async () => { // another machine already delivering this campaign: skip, or recipients get it twice
    const cfg = await getMailCfg(), c = await getCampaign(id), sec = await secret();
    for (;;) {
      const batch = await q(`SELECT x.id, x.token AS send_token, s.email, s.name, s.token FROM mail_sends x JOIN mail_subscribers s ON s.id = x.subscriber_id
        WHERE x.campaign_id=$1 AND x.status='pending' ORDER BY x.id LIMIT 25`, [id]);
      if (!batch.length) break;
      for (const r of batch) {
        if (cfg.perDay && roomToday(cfg.perDay, await sentToday()) <= 0) return; // daily limit reached: leave it 'sending'; tick() resumes it tomorrow
        try { await deliver(cfg, c, r, c.base, { sendToken: r.send_token, sec }); await q("UPDATE mail_sends SET status='sent', sent_at=now() WHERE id=$1", [r.id]); await q("UPDATE mail_campaigns SET sent = sent + 1 WHERE id=$1", [id]); }
        catch { await q("UPDATE mail_sends SET status='failed' WHERE id=$1", [r.id]); await q("UPDATE mail_campaigns SET failed = failed + 1 WHERE id=$1", [id]); }
        if (cfg.perMinute) await new Promise((ok) => setTimeout(ok, 60_000 / cfg.perMinute));
      }
    }
    await q("UPDATE mail_campaigns SET status='sent', sent_at=now() WHERE id=$1", [id]);
    });
  } catch { /* configuration problem: leave it 'sending'; the next tick retries */ }
  finally { running.delete(id); }
}

/** Starts due scheduled emails and resumes any that were interrupted by a restart. Called every minute from instrumentation.ts. */
export async function tick() {
  if (!db()) return;
  await flushQueue().catch(() => {});
  for (const c of await q("SELECT id, base FROM mail_campaigns WHERE status='scheduled' AND scheduled_at <= now()")) await begin(c.id, c.base);
  for (const c of await q("SELECT id FROM mail_campaigns WHERE status='sending'")) void work(c.id);
}

// ---- AI compose
const SYSTEM = `You write email newsletters for a community makerspace. Reply with ONLY a JSON object: {"subject": string, "preview": string, "design": {"bg": "#rrggbb", "accent": "#rrggbb", "blocks": [...]}}.
Block types: {"t":"heading","text","align":"left|center|right"}, {"t":"text","html"} (html may only use <p>, <strong>, <em>, <a href>, <ul>, <ol>, <li>, <br>; may use {{name}}), {"t":"image","src","alt"} (leave src empty), {"t":"button","label","href"}, {"t":"divider"}, {"t":"spacer","h"}, {"t":"social","links":[{"label","href"}]}, {"t":"columns","cols":[[leaf blocks],[leaf blocks]]} (2-3 columns, no nested columns), {"t":"footer","text"}.
Use 5-10 blocks, friendly and concise, end with a footer block. Use only URLs the user gave you; otherwise use "/" for site links.`;

export async function composeWithAI(prompt: string, current?: unknown) {
  const cfg = await getMailCfg();
  if (!cfg.deepseekKey) throw new Error("AI isn't set up yet — add a DeepSeek API token under Settings");
  const r = await tracedFetch("ai-deepseek", "https://api.deepseek.com/chat/completions", {
    method: "POST", headers: { authorization: "Bearer " + cfg.deepseekKey, "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.aiModel || "deepseek-chat", max_tokens: 4000, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: (current ? `Current email (revise it as asked):\n${JSON.stringify(current)}\n\n` : "") + `Request: ${prompt.slice(0, 4000)}` }] }),
  }, [cfg.deepseekKey]);
  if (!r.ok) throw new Error("AI request failed (" + r.status + ")");
  const text: string = (await r.json()).choices?.[0]?.message?.content ?? "";
  let j: any;
  try { j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { throw new Error("The AI reply wasn't usable, please try again"); }
  return { subject: String(j.subject ?? ""), preview: String(j.preview ?? ""), design: cleanDesign(j.design) };
}

// ---- tracking reports. Everything here is totals; who did what is `clickLog` and `campaignRecipients`, which the API only gives to site admins.
/** One sent email: how many were opened and clicked, how fast, when in the day, per link, and how it compares with the last 10. */
export async function trackingReport(id: number) {
  const camp = (await q("SELECT id, name, subject, status, sent_at FROM mail_campaigns WHERE id=$1", [id]))[0];
  if (!camp) throw new Error("Email not found");
  const rows = await q(`SELECT x.status, x.unsubscribed_at IS NOT NULL AS unsub, GREATEST(x.opens, CASE WHEN x.opened_at IS NULL THEN 0 ELSE 1 END) AS opens,
      extract(epoch FROM (x.opened_at - x.sent_at)) AS opened, (SELECT extract(epoch FROM (min(k.at) - x.sent_at)) FROM mail_clicks k WHERE k.send_id = x.id) AS clicked,
      extract(hour FROM x.opened_at AT TIME ZONE 'America/Detroit')::int AS hour FROM mail_sends x WHERE x.campaign_id = $1 AND x.status IN ('sent','failed')`, [id]);
  const sent = rows.filter((r) => r.status === "sent"), touches: Touch[] = sent.map((r) => ({ opened: r.opened == null ? null : +r.opened, clicked: r.clicked == null ? null : +r.clicked, hour: r.hour }));
  const opened = sent.filter((r) => r.opens > 0).length, clicked = touches.filter((t) => t.clicked != null).length;
  const prior = await q(`SELECT count(*) FILTER (WHERE x.status='sent')::float AS sent, count(*) FILTER (WHERE x.opened_at IS NOT NULL)::float AS opened, count(*) FILTER (WHERE x.clicks > 0)::float AS clicked
    FROM mail_campaigns c JOIN mail_sends x ON x.campaign_id = c.id WHERE c.id IN (SELECT id FROM mail_campaigns WHERE status='sent' AND NOT trashed AND id <> $1 AND sent_at < $2 ORDER BY sent_at DESC LIMIT 10) GROUP BY c.id`, [id, camp.sent_at ?? new Date()]);
  const avg = (k: "opened" | "clicked") => (prior.length ? prior.reduce((a, r) => a + (r.sent ? r[k] / r.sent : 0), 0) / prior.length : null);
  return {
    campaign: camp, sent: sent.length, failed: rows.length - sent.length, opened, clicked, unsubscribed: sent.filter((r) => r.unsub).length, repeat: sent.filter((r) => r.opens > 1).length,
    ...engagement(touches), benchmark: { opened: avg("opened"), clicked: avg("clicked"), n: prior.length },
    links: await q("SELECT url, count(*)::int AS clicks, count(DISTINCT send_id)::int AS people FROM mail_clicks WHERE campaign_id=$1 GROUP BY url ORDER BY people DESC, clicks DESC LIMIT 30", [id]),
  };
}
/** The Tracking front page: the last 30 sent emails side by side, and how engaged the subscribed people are. */
export async function trackingOverview() {
  const emails = await q(`SELECT c.id, c.subject, c.sent_at, count(*) FILTER (WHERE x.status='sent')::int AS sent, count(*) FILTER (WHERE x.opened_at IS NOT NULL)::int AS opened,
      count(*) FILTER (WHERE x.clicks > 0)::int AS clicked, count(*) FILTER (WHERE x.unsubscribed_at IS NOT NULL)::int AS unsubscribed
    FROM mail_campaigns c JOIN mail_sends x ON x.campaign_id = c.id WHERE c.status='sent' AND NOT c.trashed GROUP BY c.id ORDER BY c.sent_at DESC LIMIT 30`);
  const [seg] = await q(`SELECT count(*) FILTER (WHERE t.got = 0)::int AS fresh, count(*) FILTER (WHERE t.got > 0 AND t.recent > 0)::int AS engaged,
      count(*) FILTER (WHERE t.got > 0 AND t.recent = 0 AND t.ever > 0)::int AS lapsed, count(*) FILTER (WHERE t.got > 0 AND t.ever = 0)::int AS never
    FROM mail_subscribers s CROSS JOIN LATERAL (SELECT count(*) FILTER (WHERE x.status='sent') AS got, count(*) FILTER (WHERE x.opened_at IS NOT NULL) AS ever,
      count(*) FILTER (WHERE x.opened_at > now() - interval '90 days') AS recent FROM mail_sends x WHERE x.subscriber_id = s.id) t WHERE s.status = 'subscribed'`);
  return { emails: emails.reverse(), segments: seg, trackOpens: (await getMailCfg()).trackOpens, trackClicks: (await getMailCfg()).trackClicks };
}
/** Every click on one email: who, when, which link. Site admins only (the API enforces it). */
export const clickLog = (id: number) => q(`SELECT s.email, s.name, k.at, k.url FROM mail_clicks k JOIN mail_sends x ON x.id = k.send_id JOIN mail_subscribers s ON s.id = x.subscriber_id WHERE k.campaign_id = $1 ORDER BY k.at DESC LIMIT 500`, [id]);
