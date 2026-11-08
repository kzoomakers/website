import { db } from "./db";

export type Query = { id: string; query: string; calls: number; total: number; mean: number; max: number; rows: number };

// Top statements from pg_stat_monitor, else pg_stat_statements, else none (the server has neither): the counters below always work.
const TOP = (rel: string, extra: string) => `SELECT queryid::text AS id, left(min(query), 400) AS query, sum(calls)::float8 AS calls, sum(total_exec_time) AS total,
  sum(total_exec_time) / NULLIF(sum(calls), 0) AS mean, max(${extra}) AS max, sum(rows)::float8 AS rows
  FROM ${rel} WHERE ${rel === "pg_stat_monitor" ? "datname" : "dbid = (SELECT oid FROM pg_database WHERE datname"} ${rel === "pg_stat_monitor" ? "= current_database()" : "= current_database())"}
  AND query NOT LIKE '%pg_stat_monitor%' AND query NOT LIKE '%pg_stat_statements%' GROUP BY queryid ORDER BY total DESC LIMIT 15`;

// One run is shared by every open tab for 5 s, so a few admins watching cost the database the same as one.
let memo: { at: number; run: Promise<Stats> } | null = null;
export function pgStats(): Promise<Stats> {
  if (memo && Date.now() - memo.at < 5000) return memo.run;
  const run = load();
  memo = { at: Date.now(), run };
  run.catch(() => { if (memo?.run === run) memo = null; }); // a failure is not remembered
  return run;
}
export type Stats = Awaited<ReturnType<typeof load>>;

async function load() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  // One connection, one query at a time, each capped at 3 s: this page must never starve the pool the site runs on.
  const c = await d.pool.connect();
  try {
  await c.query("SET statement_timeout = '3s'");
  const one = async (sql: string) => (await c.query(sql)).rows;
  const [stat] = await one(`SELECT numbackends, xact_commit::float8 commit, xact_rollback::float8 rollback, blks_read::float8 blks_read, blks_hit::float8 blks_hit, tup_returned::float8 returned, tup_fetched::float8 fetched,
    tup_inserted::float8 inserted, tup_updated::float8 updated, tup_deleted::float8 deleted, deadlocks::float8 deadlocks, temp_bytes::float8 temp_bytes FROM pg_stat_database WHERE datname = current_database()`);
  const conns = await one("SELECT coalesce(state, 'background') AS state, count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1 ORDER BY 2 DESC");
  const [size] = await one("SELECT pg_database_size(current_database())::float8 AS bytes");
  let source = "none", queries: Query[] = [];
  const errors: string[] = []; // why each source could not be read, shown on the page
  for (const [name, rel, max] of [["pg_stat_monitor", "pg_stat_monitor", "max_exec_time"], ["pg_stat_statements", "pg_stat_statements", "max_exec_time"]] as const) {
    try { queries = await one(TOP(rel, max)); source = name; break; } catch (e) { errors.push(`${name}: ${(e as Error).message}`); }
  }
  return { at: Date.now(), source, stat, conns, size: size.bytes as number, queries, errors };
  } finally {
    await c.query("RESET statement_timeout").catch(() => {});
    c.release();
  }
}
