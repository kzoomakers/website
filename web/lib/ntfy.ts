import { tokenAllows } from "./ntfy-token";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { isAdmin } from "@/auth";

// A small ntfy server (https://ntfy.sh) speaking the same HTTP contract the mobile apps use: publish with PUT/POST, subscribe with
// /{topic}/json|sse|raw (streaming, or poll=1), message ids, `since`, keepalives. Stored in Postgres; streams poll the table.
// Not ported: attachments, scheduled delivery, email/Firebase/APNs push, WebSocket, accounts (tokens replace them), message updates/deletes.
export const TOURS_TOPIC = "kzoomakers-tours";
export const TOPIC_OK = /^[-_A-Za-z0-9]{1,64}$/;
export const RESERVED = ["v1", "docs", "static", "app", "account", "settings", "mytopic", "publish", "subscribe", "json", "sse", "raw", "auth", "send", "trigger"];
export const UNREAD_DAYS = 60, MAX_RETENTION = 120;
/** Token lifetimes people can pick, in days (null = never expires). */
export const EXPIRY: Record<string, number | null> = { never: null, "1d": 1, "1w": 7, "1m": 30, "6m": 182, "1y": 365, "3y": 1095 };
const KEEPALIVE_MS = 45_000, POLL_MS = 1500, MAX_BODY = 4096;

export type Topic = { kind: string; owner: string; name: string; description: string; public_read: boolean; public_write: boolean; retention_days: number; builtin: boolean; created_at: string };
export type Msg = { id: string; time: number; expires?: number; event: string; topic: string; title?: string; message?: string; priority?: number; tags?: string[]; click?: string; icon?: string; actions?: unknown[] };

let ready: Promise<unknown> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= (async () => {
    const p = d.pool;
    await p.query(`CREATE TABLE IF NOT EXISTS ntfy_topics (name text PRIMARY KEY, description text NOT NULL DEFAULT '', public_read boolean NOT NULL DEFAULT false, public_write boolean NOT NULL DEFAULT false,
      retention_days int NOT NULL DEFAULT 30, builtin boolean NOT NULL DEFAULT false, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
    await p.query(`CREATE TABLE IF NOT EXISTS ntfy_messages (seq bigserial PRIMARY KEY, id text UNIQUE NOT NULL, topic text NOT NULL REFERENCES ntfy_topics ON DELETE CASCADE, time timestamptz NOT NULL DEFAULT now(),
      title text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '', priority int NOT NULL DEFAULT 3, tags text[] NOT NULL DEFAULT '{}', click text NOT NULL DEFAULT '', icon text NOT NULL DEFAULT '',
      actions jsonb, sender text NOT NULL DEFAULT '', ip_hash text NOT NULL DEFAULT '')`);
    await p.query("CREATE INDEX IF NOT EXISTS ntfy_messages_topic ON ntfy_messages (topic, seq DESC)");
    await p.query(`CREATE TABLE IF NOT EXISTS ntfy_tokens (hash text PRIMARY KEY, label text NOT NULL, topics text[] NOT NULL DEFAULT '{}', write boolean NOT NULL DEFAULT true,
      created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz)`);
    // One row per subscriber connection; last_seen is bumped on every keepalive, so "connected now" works across machines.
    await p.query(`CREATE TABLE IF NOT EXISTS ntfy_clients (id bigserial PRIMARY KEY, topic text NOT NULL REFERENCES ntfy_topics ON DELETE CASCADE, at timestamptz NOT NULL DEFAULT now(),
      last_seen timestamptz NOT NULL DEFAULT now(), closed boolean NOT NULL DEFAULT false, poll boolean NOT NULL DEFAULT false, ip_hash text NOT NULL DEFAULT '', ua text NOT NULL DEFAULT '', who text NOT NULL DEFAULT '')`);
    await p.query("CREATE INDEX IF NOT EXISTS ntfy_clients_topic ON ntfy_clients (topic, at DESC)");
    await p.query("ALTER TABLE ntfy_topics ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'shared', ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT ''"); // kind: shared | user (one per person)
    await p.query("ALTER TABLE ntfy_messages ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT ''"); // set on copies delivered through a link
    await p.query("ALTER TABLE ntfy_tokens ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT ''"); // personal tokens, made on the person's own page
    // A link copies everything published to `source` into `target` (one hop, so people subscribe to just their own topic).
    await p.query(`CREATE TABLE IF NOT EXISTS ntfy_links (source text NOT NULL REFERENCES ntfy_topics ON DELETE CASCADE, target text NOT NULL REFERENCES ntfy_topics ON DELETE CASCADE,
      PRIMARY KEY (source, target), CHECK (source <> target))`);
    await p.query("INSERT INTO ntfy_topics (name, description, builtin, created_by) VALUES ($1, 'Tour bookings and cancellations, for staff', true, 'system') ON CONFLICT DO NOTHING", [TOURS_TOPIC]);
    await p.query("ALTER TABLE ntfy_tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz, ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{read,publish}'"); // scopes: read | publish
    await p.query("UPDATE ntfy_topics SET retention_days = $1 WHERE retention_days > $1", [MAX_RETENTION]);
    await syncUserTopics(p);
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}
const q = async (sql: string, args: unknown[] = []) => (await (await conn()).query(sql, args)).rows;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const mid = () => { const A = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; return [...randomBytes(12)].map((b) => A[b % 62]).join(""); };

// ---- personal topics: one per person, named from their email so it is guessable and stable.
// jkelley@gmail.com -> jkelley-at-gmail-dot-com. Staff (Google admins, or @kzoomakers.org) -> kzoomakers-jkelley.
export function userTopicName(emailIn: string) {
  const email = emailIn.trim().toLowerCase(), at = email.lastIndexOf("@"), l = email.slice(0, at), d = email.slice(at + 1);
  const esc = (x: string) => x.replace(/\./g, "-dot-").replace(/\+/g, "-plus-").replace(/[^a-z0-9_-]/g, "_");
  const name = d === "kzoomakers.org" || isAdmin(email) ? `kzoomakers-${esc(l)}` : `${esc(l)}-at-${esc(d)}`;
  return name.length <= 64 ? name : name.slice(0, 55) + "-" + sha(email).slice(0, 8); // shortcut: very long addresses get a hash tail
}
async function syncUserTopics(p: import("pg").Pool, extra: string[] = []) {
  const emails = new Set<string>([...extra, ...(process.env.ADMIN_EMAILS ?? "").split(",").map((x) => x.trim()).filter((x) => x.includes("@") && !x.startsWith("@"))].map((x) => x.toLowerCase()));
  for (const r of (await p.query("SELECT email FROM site_users WHERE verified_at IS NOT NULL")).rows) emails.add(r.email.toLowerCase());
  const list = [...emails].filter((e) => /^[^\s@]+@[^\s@]+$/.test(e));
  if (!list.length) return;
  await p.query("INSERT INTO ntfy_topics (name, kind, owner, description, retention_days, created_by) SELECT n, 'user', e, 'Personal topic', 120, 'system' FROM unnest($1::text[], $2::text[]) AS u(n, e) ON CONFLICT DO NOTHING",
    [list.map(userTopicName), list]);
}
/** The person's own topic, created if it doesn't exist yet. */
export async function ensureUserTopic(email: string) {
  await syncUserTopics(await conn(), [email]);
  return userTopicName(email);
}

// Extra personal topics: "<your topic>-<name>", kind 'extra', never public. Max 10 per person.
export const EXTRA_MAX = 10;
export const listExtraTopics = (email: string) => q("SELECT name, description, created_at FROM ntfy_topics WHERE kind = 'extra' AND owner = $1 ORDER BY name", [email.toLowerCase()]);
export async function addExtraTopic(email: string, suffix: string) {
  const s = suffix.trim().toLowerCase(), base = await ensureUserTopic(email), name = `${base}-${s}`;
  if (!/^[a-z0-9_-]{1,30}$/.test(s)) throw new Error("Use 1-30 lowercase letters, numbers, - or _.");
  if (name.length > 64) throw new Error("That name is too long.");
  if ((await listExtraTopics(email)).length >= EXTRA_MAX) throw new Error(`You can have up to ${EXTRA_MAX} extra topics.`);
  if (!(await q("INSERT INTO ntfy_topics (name, kind, owner, description, created_by) VALUES ($1,'extra',$2,'Extra personal topic',$2) ON CONFLICT DO NOTHING RETURNING 1", [name, email.toLowerCase()])).length) throw new Error("You already have that topic.");
  return name;
}
export async function deleteExtraTopic(email: string, name: string) {
  if (!(await q("DELETE FROM ntfy_topics WHERE name = $1 AND kind = 'extra' AND owner = $2 RETURNING 1", [name, email.toLowerCase()])).length) throw new Error("No such topic.");
}

// ---- iOS: apps can't hold a connection open, so Apple push is triggered by a "poll request" sent to an upstream ntfy server (ntfy.sh),
// keyed by sha256(<base url>/<topic>). The app then fetches the real message from us. Off until an admin turns it on.
export type NtfyCfg = { baseUrl: string; upstream: string; upstreamToken: string };
let cfgCache: { at: number; v: NtfyCfg } | undefined;
export async function getCfg(): Promise<NtfyCfg> {
  if (cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.v;
  const v = { baseUrl: "", upstream: "", upstreamToken: "", ...(await q("SELECT data FROM settings WHERE key = 'ntfy:config'"))[0]?.data };
  cfgCache = { at: Date.now(), v };
  return v;
}
export async function saveCfg(x: any) {
  const url = (v: unknown, what: string) => { const t = String(v ?? "").trim().replace(/\/+$/, ""); if (t && !/^https?:\/\/[^\s]+$/.test(t)) throw new Error(`${what} must be a web address starting with https://`); return t; };
  const cur = await getCfg(), v: NtfyCfg = { baseUrl: url(x.baseUrl, "The server address"), upstream: url(x.upstream, "The upstream server"), upstreamToken: x.upstreamToken ? String(x.upstreamToken).trim() : cur.upstreamToken };
  if (x.clearToken) v.upstreamToken = "";
  if (v.upstream && !v.baseUrl) throw new Error("Enter this server's public address (for example https://kzoomakers.org/ntfy) to turn on iOS push.");
  await q("INSERT INTO settings (key, data) VALUES ('ntfy:config', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(v)]);
  cfgCache = undefined;
}
function forward(topic: string, id: string) {
  getCfg().then((c) => {
    if (!c.upstream || !c.baseUrl) return;
    const hash = sha(`${c.baseUrl}/${topic}`);
    return fetch(`${c.upstream}/${hash}`, { method: "POST", body: "", signal: AbortSignal.timeout(10_000),
      headers: { "x-poll-id": id, "user-agent": "ntfy/2.0", ...(c.upstreamToken && { authorization: "Bearer " + c.upstreamToken }) } })
      .then((r) => { if (!r.ok) console.error("ntfy upstream poll request got HTTP", r.status); });
  }).catch((e) => console.error("ntfy upstream poll request failed:", e.message));
}

/** Messages in topics nobody has read for UNREAD_DAYS are dropped, for personal topics only (shared topics follow their retention days). Runs at most hourly per process. */
let swept = 0;
async function sweep() {
  if (Date.now() - swept < 3600_000) return;
  swept = Date.now();
  await q(`DELETE FROM ntfy_messages m USING ntfy_topics t WHERE t.name = m.topic AND t.kind = 'user' AND t.created_at < now() - make_interval(days => $1)
    AND NOT EXISTS (SELECT 1 FROM ntfy_clients c WHERE c.topic = t.name AND c.last_seen > now() - make_interval(days => $1))`, [UNREAD_DAYS]).catch(() => { swept = 0; });
}

// ---- links
export const listLinks = (name: string) => q("SELECT 'to' AS dir, target AS other FROM ntfy_links WHERE source = $1 UNION ALL SELECT 'from', source FROM ntfy_links WHERE target = $1 ORDER BY 1, 2", [name]);
export async function addLink(source: string, target: string) {
  if (source === target) throw new Error("A topic can't be attached to itself.");
  if ((await q("SELECT 1 FROM ntfy_topics WHERE name = ANY($1)", [[source, target]])).length !== 2) throw new Error("No such topic.");
  await q("INSERT INTO ntfy_links (source, target) VALUES ($1,$2) ON CONFLICT DO NOTHING", [source, target]);
}
export const removeLink = (source: string, target: string) => q("DELETE FROM ntfy_links WHERE source = $1 AND target = $2", [source, target]);

// ---- topics (admin)
export const listTopics = async () => { await syncUserTopics(await conn()); await sweep(); return listTopics2(); };
const listTopics2 = () => q(`SELECT t.*, (SELECT count(*)::int FROM ntfy_messages m WHERE m.topic = t.name) AS messages, (SELECT max(time) FROM ntfy_messages m WHERE m.topic = t.name) AS last_message,
  (SELECT count(*)::int FROM ntfy_clients c WHERE c.topic = t.name) AS connections, (SELECT count(*)::int FROM ntfy_clients c WHERE c.topic = t.name AND c.at > now() - interval '1 day') AS connections_24h,
  (SELECT count(*)::int FROM ntfy_clients c WHERE c.topic = t.name AND c.at > now() - interval '7 days') AS connections_7d, (SELECT max(at) FROM ntfy_clients c WHERE c.topic = t.name) AS last_connected,
  (SELECT count(*)::int FROM ntfy_clients c WHERE c.topic = t.name AND NOT c.closed AND c.last_seen > now() - interval '2 minutes') AS live
  FROM ntfy_topics t ORDER BY (kind <> 'shared'), builtin DESC, name`);

export async function saveTopic(x: any, who: string) {
  const name = String(x.name ?? "").trim(), days = Number(x.retention_days);
  if (!TOPIC_OK.test(name) || RESERVED.includes(name)) throw new Error("Topic names are 1-64 letters, numbers, - or _ (and can't be a reserved word like 'docs').");
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION) throw new Error(`Keep messages for 1 to ${MAX_RETENTION} days.`);
  const f = [String(x.description ?? "").slice(0, 300), !!x.public_read, !!x.public_write];
  if (x.existing) { if (!(await q("UPDATE ntfy_topics SET description=$2, public_read=public_read AND kind = 'shared' AND $3, public_write=public_write AND kind = 'shared' AND $4, retention_days=$5 WHERE name=$1 RETURNING 1", [name, ...f, days])).length) throw new Error("No such topic."); return; }
  if (!(await q("INSERT INTO ntfy_topics (name, description, public_read, public_write, retention_days, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING 1", [name, ...f, days, who])).length) throw new Error("That topic already exists.");
}
export async function deleteTopic(name: string) {
  if (!(await q("DELETE FROM ntfy_topics WHERE name = $1 AND NOT builtin AND kind = 'shared' RETURNING 1", [name])).length) throw new Error("Built-in and personal topics can't be deleted.");
}
export const topicMessages = (name: string, before: number | null) => q(
  "SELECT seq, id, time, title, message, priority, tags, click, sender, origin FROM ntfy_messages WHERE topic = $1 AND ($2::bigint IS NULL OR seq < $2) ORDER BY seq DESC LIMIT 100", [name, before]);
export const topicClients = (name: string) => q("SELECT id, at, last_seen, closed, poll, ua, who, ip_hash, (NOT closed AND last_seen > now() - interval '2 minutes') AS live FROM ntfy_clients WHERE topic = $1 ORDER BY id DESC LIMIT 100", [name]);

// ---- tokens (admin). The token is shown once; only its hash is kept.
export const listTokens = (owner = "") => q("SELECT hash, label, topics, write, scopes, expires_at, created_by, owner, created_at, last_used_at FROM ntfy_tokens WHERE owner = $1 ORDER BY created_at DESC", [owner]);
export const listAllTokens = () => q("SELECT hash, label, topics, write, scopes, expires_at, created_by, owner, created_at, last_used_at FROM ntfy_tokens ORDER BY owner <> '', created_at DESC");
export async function createToken(x: any, who: string, owner = "") {
  const label = String(x.label ?? "").trim().slice(0, 80), topics: string[] = Array.isArray(x.topics) ? x.topics.map(String) : [];
  if (!label) throw new Error("Give the token a label, such as the person or phone it is for.");
  if (topics.length && (await q("SELECT 1 FROM ntfy_topics WHERE name = ANY($1)", [topics])).length !== topics.length) throw new Error("Unknown topic in list.");
  const exp = String(x.expires ?? "never");
  if (!(exp in EXPIRY)) throw new Error("Pick how long the token should last.");
  const scopes: string[] = Array.isArray(x.scopes) ? x.scopes : x.write === false ? ["read"] : ["read", "publish"];
  if (!scopes.length || !scopes.every((v) => v === "read" || v === "publish")) throw new Error("Unknown token permission.");
  const token = "tk_" + randomBytes(24).toString("base64url").replace(/[-_]/g, "x").slice(0, 29);
  await q("INSERT INTO ntfy_tokens (hash, label, topics, write, scopes, expires_at, created_by, owner) VALUES ($1,$2,$3,$4,$5,CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END,$7,$8)",
    [sha(token), label, topics, scopes.includes("publish"), scopes, EXPIRY[exp], who, owner]);
  return token;
}
export const deleteToken = (hash: string, owner: string | null = null) => q("DELETE FROM ntfy_tokens WHERE hash = $1 AND ($2::text IS NULL OR owner = $2)", [hash, owner]);

// ---- auth: public flags, or a token sent as Bearer, as the Basic password (any username), or in ?auth= (base64 of the header value)
export const tokenFrom = (req: Request) => {
  let h = req.headers.get("authorization") ?? "";
  const a = new URL(req.url).searchParams.get("auth");
  if (!h && a) h = Buffer.from(a, "base64url").toString("utf8");
  if (/^bearer /i.test(h)) return h.slice(7).trim();
  if (/^basic /i.test(h)) { const s = Buffer.from(h.slice(6).trim(), "base64").toString("utf8"); return s.slice(s.indexOf(":") + 1); }
  return "";
};
/** Who may do this: returns the caller's label ("anonymous" for public access) or null if forbidden. Throws "unknown topic" for topics nobody created. */
export async function authorize(req: Request, topics: string[], write: boolean) {
  const rows = await q("SELECT name, public_read, public_write FROM ntfy_topics WHERE name = ANY($1)", [topics]);
  if (rows.length !== new Set(topics).size) throw new Error("unknown topic");
  if (rows.every((t) => (write ? t.public_write : t.public_read))) return "anonymous";
  const tok = tokenFrom(req);
  if (!tok) return null;
  const t = (await q("SELECT label, topics, scopes FROM ntfy_tokens WHERE hash = $1 AND (expires_at IS NULL OR expires_at > now())", [sha(tok)]))[0];
  if (!t || !tokenAllows(t, topics, write)) return null;
  // At most one write a minute per token: a phone polling every few seconds shouldn't rewrite the row each time.
  q("UPDATE ntfy_tokens SET last_used_at = now() WHERE hash = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')", [sha(tok)]).catch(() => {});
  return t.label as string;
}

// ---- publishing
const PRIO: Record<string, number> = { max: 5, urgent: 5, high: 4, default: 3, low: 2, min: 1 };
export const prio = (v: unknown) => { const s = String(v ?? "").toLowerCase(); return PRIO[s] ?? (/^[1-5]$/.test(s) ? +s : 3); };
const wire = (r: any): Msg => ({ id: r.id, time: Math.floor(+new Date(r.time) / 1000), expires: Math.floor(+new Date(r.time) / 1000) + 86400 * (r.retention_days ?? 30), event: "message", topic: r.topic,
  ...(r.title && { title: r.title }), message: r.message, ...(r.priority !== 3 && { priority: r.priority }), ...(r.tags?.length && { tags: r.tags }), ...(r.click && { click: r.click }), ...(r.icon && { icon: r.icon }), ...(r.actions && { actions: r.actions }) });

export async function publish(topic: string, m: { title?: string; message?: string; priority?: unknown; tags?: unknown; click?: string; icon?: string; actions?: unknown }, sender: string, ipHash = "") {
  const message = (m.message ?? "").slice(0, MAX_BODY) || "triggered", tags = (Array.isArray(m.tags) ? m.tags : String(m.tags ?? "").split(",")).map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  const actions = Array.isArray(m.actions) && m.actions.length ? JSON.stringify(m.actions.slice(0, 3)) : null;
  if (sender === "anonymous" && ipHash && (await q("SELECT count(*)::int AS n FROM ntfy_messages WHERE ip_hash = $1 AND time > now() - interval '1 minute'", [ipHash]))[0].n >= 30) throw new Error("limit reached: too many requests");
  const r = (await q(`INSERT INTO ntfy_messages (id, topic, title, message, priority, tags, click, icon, actions, sender, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *, (SELECT retention_days FROM ntfy_topics WHERE name = $2) AS retention_days`, [mid(), topic, (m.title ?? "").slice(0, 250), message, prio(m.priority), tags, (m.click ?? "").slice(0, 1000), (m.icon ?? "").slice(0, 1000), actions, sender, ipHash]))[0];
  if (Math.random() < 0.02) await q("DELETE FROM ntfy_messages m USING ntfy_topics t WHERE t.name = m.topic AND m.time < now() - make_interval(days => t.retention_days)").catch(() => {});
  if (Math.random() < 0.02) await q("DELETE FROM ntfy_clients WHERE at < now() - interval '90 days'").catch(() => {});
  await sweep();
  forward(topic, r.id);
  // Copy into every topic this one is attached to (one hop: copies are not copied again). The title says where it came from.
  for (const t of (await q("SELECT target FROM ntfy_links WHERE source = $1", [topic]).catch(() => [])).map((x) => x.target as string)) {
    const c = (await q(`INSERT INTO ntfy_messages (id, topic, title, message, priority, tags, click, icon, actions, sender, origin)
      SELECT $1, $2, left(btrim('[' || $3 || '] ' || title), 250), message, priority, tags, click, icon, actions, sender, $3 FROM ntfy_messages WHERE id = $4 RETURNING id`, [mid(), t, topic, r.id]).catch(() => []))[0];
    if (c) forward(t, c.id);
  }
  return wire(r);
}
/** For the site's own code (tour bookings): never throws, a failed push must not fail the booking. */
export const notify = (topic: string, m: Parameters<typeof publish>[1]) => publish(topic, m, "system").catch((e) => console.error("ntfy publish failed:", e));

// ---- subscribing
const UNIT: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, us: 1e-6, "µs": 1e-6, ns: 1e-9 };
/** `since` as a sequence number to read after: "all", "latest", "none", a message id, a unix time, or a duration like 10m. null = invalid. */
export async function sinceSeq(topics: string[], since: string, poll: boolean): Promise<number | null> {
  const max = async () => +(await q("SELECT COALESCE(max(seq), 0) AS m FROM ntfy_messages"))[0].m;
  if (!since) return poll ? 0 : max();
  if (since === "all") return 0;
  if (since === "none") return max();
  if (since === "latest") { const m = (await q("SELECT max(seq) AS m FROM ntfy_messages WHERE topic = ANY($1)", [topics]))[0].m; return m ? +m - 1 : 0; }
  if (/^[A-Za-z0-9]{12}$/.test(since)) return +((await q("SELECT seq FROM ntfy_messages WHERE id = $1", [since]))[0]?.seq ?? 0) ;
  let t: number;
  if (/^\d+$/.test(since)) t = +since;
  else if (/^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(since)) t = Date.now() / 1000 - [...since.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)].reduce((a, m) => a + +m[1] * UNIT[m[2]], 0);
  else return null;
  const r = (await q("SELECT COALESCE(min(seq) - 1, (SELECT COALESCE(max(seq), 0) FROM ntfy_messages)) AS s FROM ntfy_messages WHERE topic = ANY($1) AND time >= to_timestamp($2)", [topics, t]))[0];
  return +r.s;
}
export type Filter = { id?: string; message?: string; title?: string; priority?: number[]; tags?: string[] };
const pass = (m: Msg, f: Filter) => (!f.id || m.id === f.id) && (f.message === undefined || (m.message ?? "") === f.message) && (f.title === undefined || (m.title ?? "") === f.title)
  && (!f.priority?.length || f.priority.includes(m.priority ?? 3)) && (!f.tags?.length || f.tags.every((t) => m.tags?.includes(t)));
const after = (topics: string[], seq: number) => q(`SELECT m.*, t.retention_days FROM ntfy_messages m JOIN ntfy_topics t ON t.name = m.topic WHERE m.topic = ANY($1) AND m.seq > $2 AND m.time > now() - make_interval(days => t.retention_days) ORDER BY m.seq LIMIT 1000`, [topics, seq]);

const event = (event: string, topic: string): Msg => ({ id: mid(), time: Math.floor(Date.now() / 1000), event, topic });
const CT = { json: "application/x-ndjson", sse: "text/event-stream", raw: "text/plain" } as const;
export type Fmt = keyof typeof CT;
const encode = (fmt: Fmt, m: Msg) => fmt === "json" ? JSON.stringify(m) + "\n" : fmt === "sse" ? `event: ${m.event}\ndata: ${JSON.stringify(m)}\n\n` : m.event === "message" ? (m.message ?? "").replace(/\r?\n/g, " ") + "\n" : "\n";

/** The response for GET /{topics}/json|sse|raw. Polls once and ends with poll=true, otherwise stays open until the client leaves. */
// Open streams each poll the database, so they are capped per address and in total (a flood would otherwise use up the connection pool).
// shortcut: counted per process; with several server processes the real limits are multiplied by their number.
const MAX_STREAMS_PER_IP = 5, MAX_STREAMS = 50, MAX_CONNECTS_PER_MIN = 60;
const streams = new Map<string, number>();
let streamsOpen = 0;

export async function subscribe(req: Request, topics: string[], fmt: Fmt, since: number, poll: boolean, who: string, ipHash: string, f: Filter = {}) {
  await sweep();
  if (!poll && ((streams.get(ipHash) ?? 0) >= MAX_STREAMS_PER_IP || streamsOpen >= MAX_STREAMS)) throw new Error("limit reached: too many open connections");
  if ((await q("SELECT count(*)::int n FROM ntfy_clients WHERE ip_hash = $1 AND at > now() - interval '1 minute'", [ipHash]))[0].n >= MAX_CONNECTS_PER_MIN) throw new Error("limit reached: too many requests");
  const headers = { "content-type": CT[fmt] + "; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", "access-control-allow-origin": "*" };
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const ids: number[] = (await q("INSERT INTO ntfy_clients (topic, poll, ip_hash, ua, who) SELECT unnest($1::text[]), $2, $3, $4, $5 RETURNING id", [topics, poll, ipHash, ua, who])).map((r) => +r.id);
  const done = () => q("UPDATE ntfy_clients SET closed = true, last_seen = now() WHERE id = ANY($1)", [ids]).catch(() => {});
  const label = topics.join(",");
  if (poll) { const rows = await after(topics, since); await done(); return new Response(rows.map(wire).filter((m) => pass(m, f)).map((m) => encode(fmt, m)).join(""), { headers }); }
  const enc = new TextEncoder();
  let alive = true;
  streams.set(ipHash, (streams.get(ipHash) ?? 0) + 1); streamsOpen++;
  const end = () => { if (!alive) return; alive = false; done(); streamsOpen--; const n = (streams.get(ipHash) ?? 1) - 1; if (n > 0) streams.set(ipHash, n); else streams.delete(ipHash); };
  return new Response(new ReadableStream({
    async start(ctrl) {
      let last = since, ping = Date.now();
      const stop = () => { if (alive) { end(); try { ctrl.close(); } catch {} } };
      req.signal.addEventListener("abort", stop);
      const out = (m: Msg) => { try { ctrl.enqueue(enc.encode(encode(fmt, m))); } catch { stop(); } };
      out(event("open", label));
      try {
        while (alive) {
          for (const r of await after(topics, last)) { last = +r.seq; const m = wire(r); if (pass(m, f)) out(m); }
          if (Date.now() - ping >= KEEPALIVE_MS) { out(event("keepalive", label)); ping = Date.now(); await q("UPDATE ntfy_clients SET last_seen = now() WHERE id = ANY($1)", [ids]); }
          await new Promise((r) => setTimeout(r, POLL_MS)); // shortcut: polls the table; switch to LISTEN/NOTIFY if many phones stay connected
        }
      } catch { stop(); }
    },
    cancel() { end(); },
  }), { headers });
}
