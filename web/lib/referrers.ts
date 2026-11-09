import { db } from "./db";
import { classify, countable, type Kind } from "./referrers-util";
import type { Row } from "./httplog";

// Daily referrer counts, kept for a year. The raw HTTP log is capped by size, so the totals live in their own small table: one row per day, source and landing page.
const KEEP_DAYS = 366;
const MAX_ROWS = 3000; // per day and type; fake referrers past this are counted together so spam can't bloat the table
const OVERFLOW = "(many other sites)";
type Bucket = { day: string; kind: Kind; source: string; host: string; landing: string; via: string; n: number };

type State = { buf: Map<string, Bucket>; timer?: ReturnType<typeof setTimeout>; ready?: Promise<void>; trimmed: string };
const g = globalThis as unknown as { refs?: State };
const st = (): State => (g.refs ??= { buf: new Map(), trimmed: "" });

async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

const ready = () => (st().ready ??= pool().then(async (p) => {
  await p.query(`CREATE TABLE IF NOT EXISTS referrer_daily (day date NOT NULL, kind text NOT NULL, source text NOT NULL, host text NOT NULL, landing text NOT NULL, via text NOT NULL, n int NOT NULL,
    PRIMARY KEY (day, kind, source, host, landing, via))`);
}).catch((e) => { st().ready = undefined; throw e; }));

const keyOf = (b: Bucket) => [b.day, b.kind, b.source, b.host, b.landing, b.via].join("|");
function add(b: Bucket) {
  const s = st();
  let k = keyOf(b), old = s.buf.get(k);
  if (!old && s.buf.size >= 5000) { b = { ...b, source: OVERFLOW, host: "", landing: "" }; k = keyOf(b); old = s.buf.get(k); }
  if (old) old.n += b.n; else s.buf.set(k, b);
}

/** Counts the request if it is a page view that arrived from outside the site. Never throws, never waits on the database. */
export function countReferral(row: Row) {
  try {
    if (!countable(row)) return;
    const utm = row.params.utm_source;
    const hit = classify(row.referer, String(Array.isArray(utm) ? utm[0] : utm ?? ""), row.host);
    if (!hit) return;
    // Other sites: the landing page is dropped, so one spammy host costs one row a day, not one per page.
    add({ day: row.at.toISOString().slice(0, 10), ...hit, landing: hit.kind === "other" ? "" : row.path.slice(0, 200), n: 1 });
    // shortcut: counts wait up to 30s in memory, so a restart loses them; write sooner if that ever matters.
    st().timer ??= setTimeout(() => void flush(), 30_000);
  } catch { /* stats must never break a page */ }
}

async function flush() {
  const s = st();
  s.timer = undefined;
  const pending = [...s.buf.values()];
  s.buf.clear();
  if (!pending.length) return;
  let rows = pending;
  try {
    await ready();
    const p = await pool();
    // Days that already hold plenty of rows send every new source to the overflow row instead (merged, since one insert can't touch a row twice).
    const full = new Set((await p.query("SELECT day::text || kind k FROM referrer_daily WHERE day = ANY($1::date[]) GROUP BY day, kind HAVING count(*) >= $2", [[...new Set(pending.map((b) => b.day))], MAX_ROWS])).rows.map((r) => r.k));
    const merged = new Map<string, Bucket>();
    for (const b of pending) {
      const x = full.has(b.day + b.kind) && b.source !== OVERFLOW ? { ...b, source: OVERFLOW, host: "", landing: "" } : b, k = keyOf(x), o = merged.get(k);
      if (o) o.n += x.n; else merged.set(k, { ...x });
    }
    rows = [...merged.values()];
    const c = (f: (b: Bucket) => unknown) => rows.map(f);
    await p.query(
      `INSERT INTO referrer_daily (day, kind, source, host, landing, via, n)
       SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[])
       ON CONFLICT (day, kind, source, host, landing, via) DO UPDATE SET n = referrer_daily.n + EXCLUDED.n`,
      [c((b) => b.day), c((b) => b.kind), c((b) => b.source), c((b) => b.host), c((b) => b.landing), c((b) => b.via), c((b) => b.n)]);
    const today = new Date().toISOString().slice(0, 10);
    if (s.trimmed !== today) { s.trimmed = today; await p.query("DELETE FROM referrer_daily WHERE day < current_date - $1::int", [KEEP_DAYS]); }
  } catch {
    // Database down: put the counts back so a blip loses nothing (bounded by the map cap).
    for (const b of pending) add(b);
    s.timer ??= setTimeout(() => void flush(), 60_000);
  }
}

const iso = /^\d{4}-\d{2}-\d{2}$/;
/** Everything the page shows for one tab and date range (both days inclusive, UTC), plus the total for the equally long period before it. */
export async function stats(kind: Kind, from: string, to: string) {
  if (!iso.test(from) || !iso.test(to) || isNaN(Date.parse(from)) || isNaN(Date.parse(to)) || from > to) throw new Error("bad dates");
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  if (days > KEEP_DAYS) throw new Error("range too long");
  await flush(); // include what is still waiting in memory
  await ready();
  const p = await pool(), prevTo = new Date(Date.parse(from) - 864e5).toISOString().slice(0, 10), prevFrom = new Date(Date.parse(from) - days * 864e5).toISOString().slice(0, 10);
  const w = "WHERE kind = $1 AND day BETWEEN $2 AND $3", a = [kind, from, to];
  const top = (col: string) => p.query(`SELECT ${col} v, sum(n)::int n FROM referrer_daily ${w} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, a);
  const [daily, sources, landing, hosts, via, prev] = await Promise.all([
    p.query(`SELECT day::text d, source, sum(n)::int n FROM referrer_daily ${w} GROUP BY 1, 2 ORDER BY 1`, a),
    top("source"), top("landing"), top("nullif(host, '')"), top("via"),
    p.query("SELECT coalesce(sum(n), 0)::int n FROM referrer_daily WHERE kind = $1 AND day BETWEEN $2 AND $3", [kind, prevFrom, prevTo]),
  ]);
  const all = await p.query(`SELECT coalesce(sum(n), 0)::int n FROM referrer_daily ${w}`, a);
  return { days, total: all.rows[0].n, prev: prev.rows[0].n, daily: daily.rows, sources: sources.rows, landing: landing.rows, hosts: hosts.rows, via: via.rows };
}
