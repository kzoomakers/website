import type { PoolClient } from "pg";
import { conn } from "../db";
import { logAudit } from "../store";
import type { Actor } from "./certs";
import { announce, awardPass, drawn, questionsOf, REV, type Rev } from "./attempts";
import { emit } from "./notify";
import { scoreQuestions, type Q } from "./questions";

// Regrade: a published question had the wrong key. Re-score the submitted attempts on the version people took, using the corrected version's keys.
// Questions are matched by qkey, so the corrected version must keep every question. Fail-to-pass applies now and opens the certification.
// Pass-to-fail waits for a lead, who keeps the pass or revokes it. Nobody is demoted by the script.
const fail = (m: string): never => { throw new Error(m); };
const MIN_REASON = 10;

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await conn()).connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

/** Both versions must be of one test, the corrected one published and newer, and it must keep every question. */
async function versions(c: { query: PoolClient["query"] }, fromId: unknown, toId: unknown) {
  if (!Number.isInteger(fromId) || !Number.isInteger(toId)) throw new Error("Choose both versions.");
  const rows = (await c.query(`SELECT ${REV}, r.rev_no, r.status, t.title FROM test_revisions r JOIN tests t ON t.id = r.test_id WHERE r.id = ANY($1)`, [[fromId, toId]])).rows as (Rev & { rev_no: number; status: string; title: string })[];
  const from = rows.find((r) => r.id === fromId), to = rows.find((r) => r.id === toId);
  if (!from || !to) throw new Error("No such version.");
  if (from.test_id !== to.test_id) throw new Error("Those versions are of different tests.");
  if (from.status === "draft" || to.status !== "published") throw new Error("Both versions must be published, and the corrected one must be the newer one.");
  if (to.rev_no <= from.rev_no) throw new Error("The corrected version must be newer than the one people took.");
  const have = new Set((await c.query("SELECT qkey FROM rev_questions WHERE revision_id = $1", [to.id])).rows.map((x) => x.qkey));
  const gone = (await c.query("SELECT qkey FROM rev_questions WHERE revision_id = $1", [from.id])).rows.filter((x) => !have.has(x.qkey)).length;
  if (gone) throw new Error(`The corrected version has dropped ${gone} question${gone === 1 ? "" : "s"}. A regrade needs the same questions, with the answers corrected.`);
  return { from, to };
}

/** The attempt re-scored with the corrected keys, its scores keyed by the attempt's own question ids. Stored answers are keyed by question id, so they move across by qkey. */
function rescore(a: { seed: number; answers: Record<string, unknown> }, from: Rev, oldAll: (Q & { id: number; qkey: string })[], byKey: Map<string, Q & { id: number; qkey: string }>) {
  const old = drawn(oldAll, from, a.seed);
  const qs = old.map((q) => byKey.get(String(q.qkey))!); // every stored question has a qkey
  const answers: Record<string, unknown> = {};
  qs.forEach((q, i) => { answers[q.id] = a.answers?.[String(old[i].id)]; });
  const s = scoreQuestions(qs, answers, from.pass_pct);
  return { ...s, per: s.per.map((p, i) => ({ ...p, id: old[i].id })) };
}

/** Every submitted attempt on the old version, scored both ways. Expired ones are left out: they were refused for lateness, not for their key. */
async function outcomes(c: { query: PoolClient["query"] }, from: Rev, to: Rev) {
  const oldAll = await questionsOf(c, from.id), byKey = new Map((await questionsOf(c, to.id)).map((q) => [q.qkey, q]));
  const list = (await c.query("SELECT a.id, a.user_id, a.seed, a.answers, a.passed, a.pct::float AS pct, u.name, u.email FROM attempts a JOIN site_users u ON u.id = a.user_id WHERE a.revision_id = $1 AND a.status = 'submitted' AND NOT a.preview ORDER BY a.id", [from.id])).rows;
  return list.map((a) => {
    const s = rescore(a, from, oldAll, byKey);
    const kind = !a.passed && s.passed ? "promote" : a.passed && !s.passed ? "demote" : "same";
    return { a, s, kind };
  });
}
const inProgress = async (c: { query: PoolClient["query"] }, revId: number) => (await c.query("SELECT count(*)::int AS n FROM attempts WHERE revision_id = $1 AND status = 'in_progress' AND NOT preview", [revId])).rows[0].n as number;

/** What a regrade would change, without changing anything. */
export async function preview(fromId: unknown, toId: unknown) {
  const c = await conn();
  const { from, to } = await versions(c, fromId, toId);
  const all = await outcomes(c, from, to);
  const changed = all.filter((x) => x.kind !== "same");
  return {
    from: from.rev_no, to: to.rev_no, title: from.title,
    promote: all.filter((x) => x.kind === "promote").length, demote: all.filter((x) => x.kind === "demote").length, same: all.filter((x) => x.kind === "same").length,
    in_progress: await inProgress(c, from.id),
    changes: changed.slice(0, 300).map((x) => ({ attempt: x.a.id, name: x.a.name, email: x.a.email, kind: x.kind, old_pct: x.a.pct, new_pct: x.s.pct, old_passed: x.a.passed, new_passed: x.s.passed })),
  };
}

/** Applies the corrected key to one old version. Fail-to-pass is applied and certified now; pass-to-fail is queued for a lead. Refused while anyone is still mid-test on the old version. */
export async function apply(a: Actor, fromId: unknown, toId: unknown) {
  const r = await tx(async (c) => {
    const { from, to } = await versions(c, fromId, toId);
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`regrade:${from.test_id}`]); // one regrade at a time per test
    const run = (await c.query("INSERT INTO regrades (from_rev, to_rev, applied_by) VALUES ($1,$2,$3) ON CONFLICT (from_rev, to_rev) DO NOTHING RETURNING id", [from.id, to.id, a.email])).rows[0];
    if (!run) throw new Error("This correction has already been applied to that version.");
    const open = await inProgress(c, from.id);
    if (open) throw new Error(`${open} ${open === 1 ? "person is" : "people are"} still taking the old version. Apply the regrade once ${open === 1 ? "they've" : "they've all"} finished.`);
    let promoted = 0, pending = 0;
    const told: { user: number; id: number; satisfied: number[] }[] = [];
    for (const x of await outcomes(c, from, to)) {
      if (x.kind === "same") continue;
      if (x.kind === "demote" && (await c.query("SELECT 1 FROM regrade_items WHERE attempt_id = $1 AND state = 'pending'", [x.a.id])).rowCount) continue; // a lead already has this one to decide
      await c.query("INSERT INTO regrade_items (regrade_id, attempt_id, state, old_passed, old_pct, new_passed, new_pct, new_points, new_max, new_per) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [run.id, x.a.id, x.kind === "promote" ? "promoted" : "pending", x.a.passed, x.a.pct, x.s.passed, x.s.pct, x.s.points, x.s.max, JSON.stringify(x.s.per)]);
      if (x.kind === "demote") { pending++; continue; }
      promoted++;
      await c.query("UPDATE attempts SET passed = true, pct = $2, points = $3, max_points = $4, per_question = $5 WHERE id = $1", [x.a.id, x.s.pct, x.s.points, x.s.max, JSON.stringify(x.s.per)]);
      // Someone who already holds the authorization from elsewhere gets no second certification.
      const held = (await c.query("SELECT 1 FROM tool_auths_effective WHERE user_id = $1 AND NOT expired AND tool_id IN (SELECT tool_id FROM test_tools WHERE test_id = $2) LIMIT 1", [x.a.user_id, from.test_id])).rowCount;
      told.push({ user: x.a.user_id, id: x.a.id, satisfied: held ? [] : await awardPass(c, { id: x.a.id, user_id: x.a.user_id, revision_id: from.id }, { test_id: from.test_id }, x.s.pct) });
    }
    await logAudit(a.email, "training.regrade.apply", `${from.title}: revision ${from.rev_no} re-scored with revision ${to.rev_no}: ${promoted} now pass, ${pending} waiting for a lead`);
    return { promoted, pending, from, rev: { from: from.rev_no, to: to.rev_no }, told };
  });
  for (const t of r.told) await announce(t.user, t.id, r.from, { passed: true, satisfied: t.satisfied }); // after the commit: a failing email can't undo the regrade
  return { promoted: r.promoted, pending: r.pending, from: r.rev.from, to: r.rev.to };
}

/** A lead's decision on one pass-to-fail. Keep leaves the pass as it was. Revoke takes back what this attempt earned (an open certification or the authorization it granted), with the reason in the member's file. */
export async function decide(a: Actor, itemId: unknown, decision: unknown, reason: unknown) {
  const why = typeof reason === "string" ? reason.trim().slice(0, 1000) : "";
  if (!Number.isInteger(itemId)) throw new Error("No such item.");
  if (decision !== "keep" && decision !== "revoke") throw new Error("Choose keep or revoke.");
  if (why.length < MIN_REASON) throw new Error("Give a reason of at least a sentence; it goes in the member's file and the audit log.");
  if (!a.id) throw new Error("Sign in with a member account to do this; it's recorded under your name.");
  const r = await tx(async (c) => {
    const x = (await c.query(`SELECT i.id, i.attempt_id, i.new_passed, i.new_pct::float AS new_pct, i.new_points::float AS new_points, i.new_max::float AS new_max, i.new_per, a.user_id, a.revision_id, t.title, r.test_id
      FROM regrade_items i JOIN attempts a ON a.id = i.attempt_id JOIN test_revisions r ON r.id = a.revision_id JOIN tests t ON t.id = r.test_id WHERE i.id = $1 AND i.state = 'pending' FOR UPDATE OF i`, [itemId])).rows[0];
    if (!x) throw new Error("That's already been decided.");
    if (x.user_id === a.id) throw new Error("You can't decide your own regrade.");
    if (decision === "keep") {
      await c.query("UPDATE regrade_items SET state = 'kept', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1", [x.id, a.email, why]);
      await logAudit(a.email, "training.regrade.keep", `attempt #${x.attempt_id}: ${why}`);
      return { revoked: [] as { cert: number; tool: string }[], user: x.user_id, title: x.title };
    }
    // Only certifications that came from this attempt are taken back. A later pass that certified them is a different matter for a lead to look at.
    const certs = (await c.query(`SELECT ce.id, ce.tool_id, ce.state, tl.name AS tool FROM certifications ce JOIN tools tl ON tl.id = ce.tool_id
      WHERE ce.attempt_id = $1 AND ce.state IN ('passed','in_training','ready','certified') FOR UPDATE OF ce`, [x.attempt_id])).rows;
    if (!certs.length) throw new Error("There's nothing to revoke: no certification came from this attempt. Check the member's file, and keep the pass if their authorization comes from another test.");
    const revoked: { cert: number; tool: string }[] = [];
    for (const ce of certs) {
      await c.query("UPDATE certifications SET state = 'revoked', updated_at = now() WHERE id = $1", [ce.id]);
      if (ce.state === "certified") await c.query("DELETE FROM tool_auths WHERE user_id = $1 AND tool_id = $2 AND cert_id = $3", [x.user_id, ce.tool_id, ce.id]);
      await c.query("INSERT INTO cert_events (cert_id, actor, kind, note, data) VALUES ($1,$2,'override',$3,$4)", [ce.id, a.email, why, JSON.stringify({ how: "regrade_revoke", attempt: x.attempt_id })]);
      revoked.push({ cert: ce.id, tool: ce.tool });
    }
    await c.query("UPDATE attempts SET passed = $2, pct = $3, points = $4, max_points = $5, per_question = $6 WHERE id = $1", [x.attempt_id, x.new_passed, x.new_pct, x.new_points, x.new_max, JSON.stringify(x.new_per)]);
    await c.query("UPDATE regrade_items SET state = 'revoked', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1", [x.id, a.email, why]);
    await logAudit(a.email, "training.regrade.revoke", `attempt #${x.attempt_id}: ${revoked.map((v) => v.tool).join(", ")}: ${why}`);
    return { revoked, user: x.user_id, title: x.title };
  });
  for (const v of r.revoked) await emit("cert.revoked", { userId: r.user, ref: `regrade:${itemId}:${v.cert}`, vars: { tool: v.tool, reason: why } });
  return { ok: true, revoked: r.revoked.length };
}

/** The regrade history for one test, and the pass-to-fail decisions still waiting. */
export async function list(testId: unknown) {
  if (!Number.isInteger(testId)) throw new Error("No such test.");
  const c = await conn();
  const runs = (await c.query(`SELECT g.id, fr.rev_no AS from_rev, tr.rev_no AS to_rev, g.applied_by, g.applied_at,
      count(i.id) FILTER (WHERE i.state = 'promoted')::int AS promoted, count(i.id) FILTER (WHERE i.state = 'pending')::int AS pending,
      count(i.id) FILTER (WHERE i.state = 'kept')::int AS kept, count(i.id) FILTER (WHERE i.state = 'revoked')::int AS revoked
    FROM regrades g JOIN test_revisions fr ON fr.id = g.from_rev JOIN test_revisions tr ON tr.id = g.to_rev LEFT JOIN regrade_items i ON i.regrade_id = g.id
    WHERE fr.test_id = $1 GROUP BY g.id, fr.rev_no, tr.rev_no ORDER BY g.id DESC`, [testId])).rows;
  const pending = (await c.query(`SELECT i.id, i.attempt_id, i.old_pct::float AS old_pct, i.new_pct::float AS new_pct, u.name, u.email, fr.rev_no AS from_rev
    FROM regrade_items i JOIN regrades g ON g.id = i.regrade_id JOIN test_revisions fr ON fr.id = g.from_rev JOIN attempts a ON a.id = i.attempt_id JOIN site_users u ON u.id = a.user_id
    WHERE fr.test_id = $1 AND i.state = 'pending' ORDER BY i.id`, [testId])).rows;
  return { runs, pending };
}
