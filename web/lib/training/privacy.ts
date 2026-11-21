import type { PoolClient } from "pg";
import { describeQ } from "./questions";

// What we hold about one member's training, and the evidence for one attempt. Read by the PII path (staff, with a reason, logged) and by the member's own download.
// Notes: a member sees only the notes marked "member can read", and never a staff email address.
const plain = (html: string) => html.replace(/<\/?(p|div|li|br|h[1-6])[^>]*>/gi, " ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

export async function trainingRecord(c: { query: PoolClient["query"] }, userId: number, own: boolean) {
  const u = (await c.query("SELECT name, email FROM site_users WHERE id = $1", [userId])).rows[0];
  if (!u) return null;
  const acc = (await c.query("SELECT time_multiplier::float AS time_multiplier, read_aloud, notes, set_by, set_at FROM training_accommodations WHERE user_id = $1", [userId])).rows[0] ?? null;
  const certifications = (await c.query(`SELECT ce.id, tl.name AS tool, ce.state, ce.source, ce.created_at, ce.certified_at, ${own ? "NULL::text" : "ce.certified_by"} AS certified_by, ce.valid_until, ce.signoffs_required, r.rev_no
    FROM certifications ce JOIN tools tl ON tl.id = ce.tool_id LEFT JOIN test_revisions r ON r.id = ce.revision_id WHERE ce.user_id = $1 ORDER BY ce.created_at`, [userId])).rows;
  const events = (await c.query(`SELECT e.cert_id, e.at, e.actor, e.kind, e.note, e.shared FROM cert_events e JOIN certifications ce ON ce.id = e.cert_id
    WHERE ce.user_id = $1 AND (NOT $2::boolean OR e.shared) ORDER BY e.at, e.id`, [userId, own])).rows.map((e) => ({ ...e, actor: own ? "Trainer" : e.actor }));
  const signoffs = (await c.query(`SELECT s.cert_id, s.at, ${own ? "NULL::text" : "s.note"} AS note, ${own ? "NULL::text" : "x.name"} AS trainer
    FROM cert_signoffs s JOIN certifications ce ON ce.id = s.cert_id JOIN site_users x ON x.id = s.trainer_id WHERE ce.user_id = $1 ORDER BY s.at`, [userId])).rows;
  const attempts = (await c.query(`SELECT a.id, t.title, r.rev_no, a.status, a.preview, a.started_at, a.submitted_at, a.pct::float AS pct, a.passed, ${own ? "NULL::text" : "a.voided_reason"} AS voided_reason
    FROM attempts a JOIN test_revisions r ON r.id = a.revision_id JOIN tests t ON t.id = r.test_id WHERE a.user_id = $1 ORDER BY a.started_at`, [userId])).rows;
  const authorizations = (await c.query(`SELECT tl.name AS tool, ae.source, ae.granted_at, ae.expires_on, ae.retake_due_on, ae.expired FROM tool_auths_effective ae JOIN tools tl ON tl.id = ae.tool_id WHERE ae.user_id = $1 ORDER BY tl.name`, [userId])).rows;
  const rollouts = (await c.query(`SELECT tl.name AS tool, rm.status, to_char(ro.deadline, 'YYYY-MM-DD') AS deadline FROM rollout_members rm JOIN rollouts ro ON ro.id = rm.rollout_id JOIN tools tl ON tl.id = rm.tool_id WHERE rm.user_id = $1 ORDER BY ro.deadline`, [userId])).rows;
  const learning = {
    lessons: (await c.query(`SELECT co.title AS course, l.title AS lesson, p.state, p.updated_at FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN course_sections s ON s.id = l.section_id JOIN courses co ON co.id = s.course_id WHERE p.user_id = $1 ORDER BY p.updated_at`, [userId])).rows,
    practice: (await c.query(`SELECT t.title AS test, a.started_at, a.finished_at, (SELECT count(*)::int FROM jsonb_each(a.state->'answers')) AS answered,
      (SELECT count(*)::int FROM jsonb_each(a.state->'answers') e WHERE (e.value->>'frac')::float = 1) AS correct FROM practice_attempts a JOIN tests t ON t.id = a.test_id WHERE a.user_id = $1 ORDER BY a.started_at`, [userId])).rows,
  };
  return {
    name: String(u.name).trim(),
    email: u.email,
    accommodation: acc && (own ? { time_multiplier: acc.time_multiplier, read_aloud: acc.read_aloud } : acc),
    certifications, events, signoffs, attempts, authorizations, rollouts, learning, // learning: course progress and practice runs (practice never counts toward authorization)
  };
}

/** One attempt as it was stored, with the revision it ran on: what staff hand over when a result is disputed. */
export async function attemptEvidence(c: { query: PoolClient["query"] }, attemptId: number) {
  const a = (await c.query(`SELECT a.id, a.user_id, a.status, a.seed, a.started_at, a.due_at, a.submitted_at, a.seq, a.answers, a.per_question, a.points::float AS points, a.max_points::float AS max_points, a.pct::float AS pct, a.passed,
      a.time_multiplier::float AS time_multiplier, a.read_aloud, a.ip, a.user_agent, a.voided_by, a.voided_reason, u.name, u.email, t.title, r.id AS revision_id, r.rev_no, r.content_hash, r.pass_pct, r.time_limit_min, r.published_at, r.published_by,
      (SELECT string_agg(tl.name, ', ' ORDER BY tl.name) FROM test_tools tt JOIN tools tl ON tl.id = tt.tool_id WHERE tt.test_id = t.id) AS tools
    FROM attempts a JOIN site_users u ON u.id = a.user_id JOIN test_revisions r ON r.id = a.revision_id JOIN tests t ON t.id = r.test_id WHERE a.id = $1 AND NOT a.preview`, [attemptId])).rows[0];
  if (!a) return null;
  const qs = (await c.query("SELECT id, qkey, position, type, prompt_html, points::float AS points, config, required_correct FROM rev_questions WHERE revision_id = $1 ORDER BY position, id", [a.revision_id])).rows;
  const per = new Map<number, { points: number; max: number; correct: boolean }>((a.per_question as { id: number; points: number; max: number; correct: boolean }[]).map((p) => [p.id, p]));
  const regrade = (await c.query(`SELECT fr.rev_no AS from_rev, tr.rev_no AS to_rev, g.applied_at, g.applied_by, i.state, i.old_passed, i.old_pct::float AS old_pct, i.new_passed, i.new_pct::float AS new_pct, i.decided_by, i.decided_at, i.decision_note
    FROM regrade_items i JOIN regrades g ON g.id = i.regrade_id JOIN test_revisions fr ON fr.id = g.from_rev JOIN test_revisions tr ON tr.id = g.to_rev WHERE i.attempt_id = $1 ORDER BY i.id`, [attemptId])).rows;
  return {
    userId: a.user_id as number, name: String(a.name).trim(),
    data: {
      attempt: { id: a.id, status: a.status, started_at: a.started_at, due_at: a.due_at, submitted_at: a.submitted_at, seq: a.seq, passed: a.passed, pct: a.pct, points: a.points, max_points: a.max_points, time_multiplier: a.time_multiplier, read_aloud: a.read_aloud, voided_by: a.voided_by, voided_reason: a.voided_reason },
      member: { name: a.name, email: a.email },
      test: { title: a.title, tools: a.tools },
      revision: { rev_no: a.rev_no, content_hash: a.content_hash, pass_pct: a.pass_pct, time_limit_min: a.time_limit_min, published_at: a.published_at, published_by: a.published_by },
      network: { ip: a.ip, user_agent: a.user_agent },
      regrade, // the score above is the corrected one when this is not empty; old_pct is what it was
      // The answers are the last saved set: autosaves overwrite each other, so earlier edits are not kept.
      questions: qs.map((q) => ({ position: q.position, type: q.type, prompt: plain(q.prompt_html), points: q.points, critical: q.required_correct, key: describeQ(q), drawn: per.has(q.id), given: a.answers?.[String(q.id)] ?? null, scored: per.get(q.id) ?? null })),
      exported_at: new Date().toISOString(),
    },
  };
}
