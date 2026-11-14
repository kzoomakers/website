import { db } from "./db";
import { skipped } from "./httplog-util";

// HTTP request log. One row per request, in a table partitioned by day (UTC) so that retention is a cheap DROP of the oldest partition
// and every time-bounded query only touches the days it asks about. Rows are buffered in memory and written in batches.
export const KEEP_ROWS = 10_000_000;
const TABLE = "http_log";

export type Row = { at: Date; ip: string; method: string; host: string; path: string; query: string; params: Record<string, string | string[]>; ua: string; referer: string; user?: string; status?: number };

const SECRET_PARAM = /token|secret|password|passwd|code|key|sig|auth/i;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Builds a log row from a request. Headers are not stored (only the user agent and referrer); token-like query params are replaced by "[redacted]" so the log never holds a live sign-in token. */
export function toRow(req: Pick<Request, "url" | "method" | "headers">): Row {
  const u = new URL(req.url), h = req.headers;
  const params: Row["params"] = {}, clean = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    const val = SECRET_PARAM.test(k) ? "[redacted]" : cut(v, 1000);
    clean.append(k, val);
    const old = params[k];
    params[k] = old === undefined ? val : Array.isArray(old) ? [...old, val] : [old, val];
  }
  const ip = h.get("fly-client-ip") ?? h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? h.get("x-real-ip") ?? "";
  return { at: new Date(), ip: cut(ip, 100), method: req.method, host: cut(h.get("host") ?? u.host, 255), path: cut(u.pathname, 2000), query: cut(clean.toString(), 4000), params, ua: cut(h.get("user-agent") ?? "", 1000), referer: cut(h.get("referer") ?? "", 2000) };
}

const g = globalThis as unknown as { httplog?: { buf: Row[]; timer?: ReturnType<typeof setTimeout>; ready?: Promise<void>; day: string; sweptAt: number } };
const st = () => (g.httplog ??= { buf: [], day: "", sweptAt: 0 });
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const part = (day: string) => `${TABLE}_${day.replace(/-/g, "")}`;

async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

/** Creates the parent table, its indexes and today's + the next two days' partitions; once a day (and at start) also trims the oldest days down to KEEP_ROWS. */
async function maintain() {
  const s = st(), now = new Date(), today = dayStr(now);
  if (s.ready && s.day === today) return s.ready;
  s.day = today;
  return (s.ready = (async () => {
    const p = await pool();
    await p.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      id bigserial, at timestamptz NOT NULL DEFAULT now(), ip text NOT NULL DEFAULT '', method text NOT NULL, host text NOT NULL DEFAULT '', path text NOT NULL,
      query text NOT NULL DEFAULT '', params jsonb NOT NULL DEFAULT '{}', ua text NOT NULL DEFAULT '', referer text NOT NULL DEFAULT '', "user" text NOT NULL DEFAULT ''
    ) PARTITION BY RANGE (at)`);
    // ALTER / CREATE INDEX take table locks even when they change nothing (and wait behind long queries), so only run them when something is missing.
    const cols = new Set((await p.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1", [TABLE])).rows.map((r) => r.column_name));
    if (cols.has("headers")) await p.query(`ALTER TABLE ${TABLE} DROP COLUMN headers`);
    if (!cols.has("status")) await p.query(`ALTER TABLE ${TABLE} ADD COLUMN status smallint NOT NULL DEFAULT 0`); // response code; 0 = rows from before it was recorded
    const have = new Set((await p.query("SELECT indexname FROM pg_indexes WHERE tablename = $1", [TABLE])).rows.map((r) => r.indexname));
    for (const ix of ["(at DESC)", "(path, at DESC)", "(ip, at DESC)", "(host, at DESC)", "(\"user\", at DESC)", "(status, at DESC)"]) {
      const name = `${TABLE}_${ix.replace(/\W+/g, "_")}_ix`;
      if (!have.has(name)) await p.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${TABLE} ${ix}`);
    }
    for (let i = 0; i < 3; i++) {
      const a = new Date(now.getTime() + i * 864e5), b = new Date(a.getTime() + 864e5);
      await p.query(`CREATE TABLE IF NOT EXISTS ${part(dayStr(a))} PARTITION OF ${TABLE} FOR VALUES FROM ('${dayStr(a)} 00:00:00+00') TO ('${dayStr(b)} 00:00:00+00')`);
    }
    // n_live_tup is the planner's running estimate: good enough for a cap, and free (no count(*) over 50M rows).
    const parts = (await p.query(`SELECT c.relname, coalesce(t.n_live_tup, 0)::bigint n FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid LEFT JOIN pg_stat_user_tables t ON t.relid = c.oid
      WHERE i.inhparent = '${TABLE}'::regclass AND c.relname ~ '^${TABLE}_[0-9]{8}$' ORDER BY c.relname`)).rows as { relname: string; n: string }[];
    let total = parts.reduce((a, r) => a + Number(r.n), 0);
    // Always keep at least the 2 newest days, even if one day alone is over the cap.
    for (const r of parts.slice(0, -2)) { if (total <= KEEP_ROWS) break; await p.query(`DROP TABLE ${r.relname}`); total -= Number(r.n); }
  })().catch((e) => { s.ready = undefined; s.day = ""; throw e; }));
}

const names = new Map<string, string>();
/** "site:12" (a signed cookie, id only) becomes "site:name@example.org", looked up once per id. */
async function resolve(rows: Row[]) {
  const ids = [...new Set(rows.map((r) => r.user).filter((u): u is string => !!u?.startsWith("site:") && !u.includes("@") && !names.has(u)))];
  if (ids.length) for (const r of (await (await pool()).query("SELECT id, email FROM site_users WHERE id = ANY($1)", [ids.map((u) => Number(u.slice(5)))])).rows) names.set(`site:${r.id}`, `site:${r.email}`);
  for (const r of rows) if (r.user && names.has(r.user)) r.user = names.get(r.user);
  if (names.size > 5000) names.clear();
}

async function flush() {
  const s = st();
  if (s.timer) { clearTimeout(s.timer); s.timer = undefined; }
  const rows = s.buf.splice(0, 5000);
  if (!rows.length) return;
  try {
    await maintain();
    await resolve(rows).catch(() => {});
    const c = (f: (r: Row) => unknown) => rows.map(f);
    await (await pool()).query(
      `INSERT INTO ${TABLE} (at, ip, method, host, path, query, params, ua, referer, "user", status)
       SELECT at, ip, method, host, path, query, params::jsonb, ua, referer, u, st
       FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::int[]) AS t(at, ip, method, host, path, query, params, ua, referer, u, st)`,
      [c((r) => r.at), c((r) => r.ip), c((r) => r.method), c((r) => r.host), c((r) => r.path), c((r) => r.query), c((r) => JSON.stringify(r.params)), c((r) => r.ua), c((r) => r.referer), c((r) => r.user ?? ""), c((r) => r.status ?? 0)]);
  } catch {
    // Database down: keep what we can (bounded) so a blip loses nothing, but never grow without limit or break the request.
    s.buf.unshift(...rows.slice(0, Math.max(0, 20000 - s.buf.length)));
  }
  if (s.buf.length >= 500) void flush();
}

/** Queues one request for the log. Never throws and never waits on the database. */
export function record(row: Row) {
  if (skipped(row.ip)) return;
  const s = st();
  if (s.buf.length >= 20000) s.buf.shift();
  s.buf.push(row);
  if (s.buf.length >= 500) void flush();
  else s.timer ??= setTimeout(() => void flush(), 1000);
}

export type Filter = { q?: string; from?: string; to?: string; method?: string; ip?: string; path?: string; host?: string; user?: string; status?: string; offset?: number; unit?: string };

function where(f: Filter) {
  const ps: unknown[] = [], w: string[] = [];
  const add = (v: unknown) => `$${ps.push(v)}`;
  const date = (d?: string) => (d && !isNaN(Date.parse(d)) ? new Date(d) : null);
  const from = date(f.from) ?? new Date(Date.now() - 864e5), to = date(f.to);
  w.push(`at >= ${add(from)}`);
  if (to) w.push(`at < ${add(to)}`);
  if (f.method) w.push(`method = ${add(f.method)}`);
  if (f.ip) w.push(`ip = ${add(f.ip)}`);
  if (f.path) w.push(`path = ${add(f.path)}`);
  if (f.host) w.push(`host = ${add(f.host)}`);
  if (f.user) w.push(`"user" = ${add(f.user)}`);
  if (/^[1-5]xx$/.test(f.status ?? "")) w.push(`status BETWEEN ${add(Number(f.status![0]) * 100)} AND ${add(Number(f.status![0]) * 100 + 99)}`); // a class: "404" or "4xx"
  else if (/^\d{3}$/.test(f.status ?? "")) w.push(`status = ${add(Number(f.status))}`);
  if (f.q?.trim()) { const p = add(`%${f.q.trim().replace(/[\\%_]/g, "\\$&")}%`); w.push(`(concat_ws(' ', ip, "user", method, host, path, query, ua, referer) ILIKE ${p} OR params::text ILIKE ${p})`); }
  return { sql: "WHERE " + w.join(" AND "), ps };
}

/** Rows (newest first), the total, requests over time and top-N breakdowns for the same filter. The time bound keeps every query inside the partitions it needs. */
export async function query(f: Filter) {
  await maintain();
  const c = await (await pool()).connect();
  try {
    await c.query("SET statement_timeout = 25000");
    const { sql, ps } = where(f);
    const unit = ["second", "minute", "hour", "day"].includes(f.unit ?? "") ? f.unit : "hour";
    // One pass over the filtered rows for every number and top list (a single connection runs one query at a time, so 11 separate scans took 11 turns).
    const top = (col: string) => `(SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT ${col} v, count(*)::int n FROM f GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x)`;
    const [rows, stats] = await Promise.all([
      (await pool()).query(`SELECT id, at, ip, "user", method, host, path, query, ua, referer, status FROM ${TABLE} ${sql} ORDER BY at DESC, id DESC LIMIT 100 OFFSET ${Math.max(0, Math.floor(Number(f.offset)) || 0)}`, ps),
      c.query(`WITH f AS MATERIALIZED (SELECT at, ip, "user" u, method, host, path, ua, referer, status FROM ${TABLE} ${sql})
        SELECT (SELECT count(*)::int FROM f) n, (SELECT count(DISTINCT ip)::int FROM f) ips, (SELECT count(DISTINCT NULLIF(u, ''))::int FROM f) users,
          (SELECT coalesce(jsonb_agg(b ORDER BY t), '[]') FROM (SELECT date_trunc('${unit}', at) t, count(*)::int n, count(*) FILTER (WHERE status BETWEEN 200 AND 299)::int s2, count(*) FILTER (WHERE status BETWEEN 300 AND 399)::int s3, count(*) FILTER (WHERE status BETWEEN 400 AND 499)::int s4, count(*) FILTER (WHERE status >= 500)::int s5 FROM f GROUP BY 1) b) buckets,
          ${top("path")} paths, ${top("ip")} ips_top, ${top("NULLIF(u, '')")} users_top, ${top("ua")} uas, ${top("NULLIF(referer, '')")} referers, ${top("method")} methods, ${top("host")} hosts, ${top("NULLIF(status, 0)")} statuses`, ps),
    ]);
    const t = stats.rows[0];
    return { rows: rows.rows, total: t.n, uniq: { ips: t.ips, users: t.users }, buckets: t.buckets, top: { path: t.paths, ip: t.ips_top, user: t.users_top, ua: t.uas, referer: t.referers, method: t.methods, host: t.hosts, status: t.statuses } };
  } finally {
    await c.query("RESET statement_timeout").catch(() => {});
    c.release();
  }
}

/** One request with its params. `at` lets Postgres go straight to the right day's partition. */
export async function detail(id: number, at: string) {
  const t = new Date(at);
  if (!Number.isInteger(id) || isNaN(+t)) return null;
  const r = await (await pool()).query(`SELECT * FROM ${TABLE} WHERE id = $1 AND at = $2`, [id, t]);
  return r.rows[0] ?? null;
}
