import { conn } from "../db";

// Read-only reports for Training > Reports. Each returns plain rows; toCsv turns any of them into a download.
const num = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);

/** CSV with spreadsheet formula injection blocked: a cell starting = + - @ (or a tab/CR) gets a leading apostrophe. */
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]), cell = (v: unknown) => { let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((k) => cell(r[k])).join(","))].join("\r\n") + "\r\n";
}

export const REPORTS: Record<string, () => Promise<Record<string, unknown>[]>> = {
  // Everything done by exception, newest first: the board's review list.
  overrides: async () => (await (await conn()).query(`SELECT e.at, e.actor AS by, e.data->>'how' AS action, u.name AS member, tl.name AS tool, e.note AS reason
    FROM cert_events e JOIN certifications ce ON ce.id = e.cert_id JOIN site_users u ON u.id = ce.user_id JOIN tools tl ON tl.id = ce.tool_id WHERE e.kind = 'override' ORDER BY e.at DESC LIMIT 1000`)).rows,
  // Where everyone is, and how long a pass waits for sign-off.
  pipeline: async () => {
    const c = await conn();
    const states = (await c.query("SELECT state, count(*)::int AS people FROM certifications GROUP BY state ORDER BY 1")).rows;
    const w = (await c.query("SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY h) AS median, percentile_cont(0.9) WITHIN GROUP (ORDER BY h) AS p90 FROM (SELECT extract(epoch FROM certified_at - created_at) / 3600 AS h FROM certifications WHERE state = 'certified' AND certified_at IS NOT NULL AND source = 'test') x")).rows[0];
    return [...states.map((s) => ({ item: `State: ${s.state}`, value: s.people })), { item: "Hours from pass to sign-off, median", value: num(w.median) }, { item: "Hours from pass to sign-off, 90th percentile", value: num(w.p90) }];
  },
  coverage: async () => (await (await conn()).query(`SELECT t.name AS tool, t.category,
      count(*) FILTER (WHERE a.user_id IS NOT NULL AND NOT a.expired)::int AS authorized, count(*) FILTER (WHERE a.source = 'training' AND NOT a.expired)::int AS by_training, count(*) FILTER (WHERE a.source = 'legacy' AND NOT a.expired)::int AS legacy,
      count(*) FILTER (WHERE a.source IN ('override','manual') AND NOT a.expired)::int AS by_exception, count(*) FILTER (WHERE a.effective_expiry BETWEEN (now() AT TIME ZONE 'America/Detroit')::date AND (now() AT TIME ZONE 'America/Detroit')::date + 90)::int AS expiring_90_days,
      (SELECT count(*)::int FROM tool_trainers x WHERE x.tool_id = t.id) AS trainers,
      EXISTS (SELECT 1 FROM test_tools x JOIN tests s ON s.id = x.test_id JOIN test_revisions r ON r.test_id = s.id AND r.status = 'published' WHERE x.tool_id = t.id AND NOT s.archived) AS has_test
    FROM tools t LEFT JOIN tool_auths_effective a ON a.tool_id = t.id WHERE t.archived_at IS NULL GROUP BY t.id ORDER BY lower(t.category), lower(t.name)`)).rows,
  // Who did the sign-offs and hands-on sessions in the last 90 days, and how long people waited for them.
  trainers: async () => (await (await conn()).query(`SELECT e.actor AS trainer,
      count(*) FILTER (WHERE e.kind = 'certified')::int AS signed_off, count(*) FILTER (WHERE e.kind = 'training_session')::int AS sessions_logged, count(*) FILTER (WHERE e.kind = 'reject')::int AS sent_back,
      round(avg(extract(epoch FROM ce.certified_at - ce.created_at) / 86400) FILTER (WHERE e.kind = 'certified')::numeric, 1)::float AS avg_days_waited
    FROM cert_events e JOIN certifications ce ON ce.id = e.cert_id WHERE e.kind IN ('certified','training_session','reject') AND e.at > now() - interval '90 days' GROUP BY e.actor ORDER BY signed_off DESC, e.actor`)).rows,
  // Each forced re-pass: how many have passed it, are still pending, lapsed or were exempted.
  rollouts: async () => (await (await conn()).query(`SELECT r.id AS rollout, string_agg(DISTINCT t.name, ', ') AS tools, to_char(r.deadline,'YYYY-MM-DD') AS deadline, CASE WHEN r.undone_at IS NOT NULL THEN 'undone' WHEN r.deadline < current_date THEN 'past deadline' ELSE 'open' END AS status,
      count(*) FILTER (WHERE m.status = 'satisfied')::int AS satisfied, count(*) FILTER (WHERE m.status = 'pending')::int AS pending, count(*) FILTER (WHERE m.status = 'lapsed')::int AS lapsed, count(*) FILTER (WHERE m.status = 'exempt')::int AS exempt
    FROM rollouts r LEFT JOIN rollout_members m ON m.rollout_id = r.id LEFT JOIN tools t ON t.id = m.tool_id GROUP BY r.id ORDER BY r.id DESC LIMIT 200`)).rows,
  // The site's audit log, training entries only (the full log needs System access).
  audit: async () => (await (await conn()).query("SELECT at, actor AS by, action, target FROM audit WHERE action LIKE 'training.%' ORDER BY at DESC LIMIT 500")).rows,
  // Per question across revisions (by qkey). Flags point at a wrong key or a useless question; judge by the question, not the number alone.
  questions: async () => (await (await conn()).query(`WITH x AS (
      SELECT q.qkey, a.id AS attempt, a.pct, (p->>'correct')::boolean AS ok, q.prompt_html, tl.name AS tool
      FROM attempts a JOIN test_revisions r ON r.id = a.revision_id JOIN rev_questions q ON q.revision_id = r.id
      JOIN LATERAL jsonb_array_elements(a.per_question) p ON (p->>'id')::int = q.id
      JOIN test_tools tt ON tt.test_id = r.test_id JOIN tools tl ON tl.id = tt.tool_id
      WHERE a.status = 'submitted' AND NOT a.preview)
    SELECT tool, left(regexp_replace(max(prompt_html), '<[^>]*>', '', 'g'), 100) AS question, count(*)::int AS attempts, round(100.0 * count(*) FILTER (WHERE ok) / count(*), 1)::float AS pct_correct,
      round((avg(pct) FILTER (WHERE ok) - avg(pct) FILTER (WHERE NOT ok))::numeric, 1)::float AS discrimination,
      CASE WHEN count(*) < 10 THEN '' WHEN count(*) FILTER (WHERE ok) * 5 < count(*) THEN 'nearly everyone misses it: is the key wrong?'
        WHEN count(*) FILTER (WHERE ok) * 100 > count(*) * 97 THEN 'nearly everyone gets it right: is it useful?' WHEN avg(pct) FILTER (WHERE ok) < avg(pct) FILTER (WHERE NOT ok) THEN 'high scorers miss it: is the key wrong?' ELSE '' END AS flag
    FROM x GROUP BY qkey, tool ORDER BY (CASE WHEN count(*) < 10 THEN 1 ELSE 0 END), 6 DESC, 4 LIMIT 500`)).rows,
};
