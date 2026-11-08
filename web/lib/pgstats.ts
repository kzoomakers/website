import { db } from "./db";

export type Query = { id: string; query: string; calls: number; total: number; mean: number; max: number; rows: number };

// Top statements from pg_stat_monitor, else pg_stat_statements, else none (the server has neither): the counters below always work.
const TOP = (rel: string, extra: string) => `SELECT queryid::text AS id, left(min(query), 400) AS query, sum(calls)::float8 AS calls, sum(total_exec_time) AS total,
  sum(total_exec_time) / NULLIF(sum(calls), 0) AS mean, max(${extra}) AS max, sum(rows)::float8 AS rows
  FROM ${rel} WHERE ${rel === "pg_stat_monitor" ? "datname" : "dbid = (SELECT oid FROM pg_database WHERE datname"} ${rel === "pg_stat_monitor" ? "= current_database()" : "= current_database())"}
  AND query NOT LIKE '%pg_stat_monitor%' AND query NOT LIKE '%pg_stat_statements%' GROUP BY queryid ORDER BY total DESC LIMIT 15`;

export async function pgStats() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  const one = async (sql: string) => (await d.pool.query(sql)).rows;
  const [[stat], conns, [size]] = await Promise.all([
    one(`SELECT numbackends, xact_commit::float8 commit, xact_rollback::float8 rollback, blks_read::float8 blks_read, blks_hit::float8 blks_hit, tup_returned::float8 returned, tup_fetched::float8 fetched,
      tup_inserted::float8 inserted, tup_updated::float8 updated, tup_deleted::float8 deleted, deadlocks::float8 deadlocks, temp_bytes::float8 temp_bytes FROM pg_stat_database WHERE datname = current_database()`),
    one("SELECT coalesce(state, 'background') AS state, count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1 ORDER BY 2 DESC"),
    one("SELECT pg_database_size(current_database())::float8 AS bytes"),
  ]);
  let source = "none", queries: Query[] = [];
  for (const [name, rel, max] of [["pg_stat_monitor", "pg_stat_monitor", "max_exec_time"], ["pg_stat_statements", "pg_stat_statements", "max_exec_time"]] as const) {
    try { queries = await one(TOP(rel, max)); source = name; break; } catch { /* extension not installed here: try the next */ }
  }
  return { at: Date.now(), source, stat, conns, size: size.bytes as number, queries };
}
