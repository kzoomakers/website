import { db } from "./db";
import { logAudit } from "./store";
import { addMember, getMailCfg, mailReady, sendQueued as send } from "./mail";
import { complete } from "./ai";
import { changesPrompt, diffVersions, summarize, type Change, type Section, type Version } from "./waiver-diff";

// Versions of the membership agreement. Published versions are never edited or deleted (legal/technical review); a change is a new version.
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const esc = (s: string) => s.replace(/[<>&"]/g, "");

/** Where a signed-in person stands: their stored onboarding step, 'resign' when a mandatory version newer than the one they signed exists, or 'profile' when their phone, address or an emergency contact is missing. Needs `site_users u` in scope. */
export const STEP_SQL = `CASE WHEN u.onboarding = 'done' AND u.approval = 'approved' THEN
  CASE WHEN COALESCE((SELECT max(d.version_id) FROM sign_docs d WHERE d.user_id = u.id AND d.kind = 'waiver' AND d.status = 'complete'), 0) < COALESCE((SELECT max(id) FROM waiver_versions WHERE mandatory), 0) THEN 'resign'
       WHEN u.phone = '' OR u.address1 = '' OR NOT EXISTS (SELECT 1 FROM emergency_contacts e WHERE e.user_id = u.id) THEN 'profile'
       ELSE 'done' END
  ELSE u.onboarding END`;

/** Call after anything that could finish onboarding (waiver, ID, profile, emergency contact, sign-in): the first time they are approved, have signed the waiver, uploaded an ID and saved an emergency contact, the person joins the Members list. Once only, so an admin removing them sticks. */
export async function joinMembersIfDone(userId: number) {
  const c = await conn();
  try {
    const u = (await c.query(`UPDATE site_users u SET member_listed_at = now() WHERE u.id = $1 AND u.member_listed_at IS NULL AND u.approval = 'approved'
      AND EXISTS (SELECT 1 FROM sign_docs d WHERE d.user_id = u.id AND d.kind = 'waiver' AND d.status = 'complete')
      AND EXISTS (SELECT 1 FROM member_ids i WHERE i.user_id = u.id) AND EXISTS (SELECT 1 FROM emergency_contacts e WHERE e.user_id = u.id) RETURNING u.email, u.name`, [userId])).rows[0];
    if (!u) return;
    try { await addMember(u.email, u.name); }
    catch (e) { await c.query("UPDATE site_users SET member_listed_at = NULL WHERE id = $1", [userId]); throw e; } // try again on their next save or sign-in
  } catch (e) { console.error("Members list:", e); } // a mailing-list hiccup must not fail the save
}

const COLS = "id, revision, title, sections, closing, summary, mandatory, created_by, created_at";
export const listVersions = async (): Promise<(Version & { signed: number })[]> =>
  (await (await conn()).query(`SELECT ${COLS}, (SELECT count(DISTINCT d.user_id)::int FROM sign_docs d WHERE d.version_id = v.id AND d.kind = 'waiver' AND d.status = 'complete'
    AND d.id = (SELECT max(x.id) FROM sign_docs x WHERE x.user_id = d.user_id AND x.kind = 'waiver' AND x.status = 'complete')) AS signed FROM waiver_versions v ORDER BY id DESC`)).rows;
export const getVersion = async (id: number): Promise<Version | null> => (await (await conn()).query(`SELECT ${COLS} FROM waiver_versions WHERE id = $1`, [id])).rows[0] ?? null;
export const latestVersion = async (): Promise<Version> => (await (await conn()).query(`SELECT ${COLS} FROM waiver_versions ORDER BY id DESC LIMIT 1`)).rows[0];

function check(secs: unknown): Section[] {
  if (!Array.isArray(secs) || !secs.length || secs.length > 200) throw new Error("Add at least one section.");
  const out = secs.map((s: any) => ({ heading: clip(s?.heading, 200), body: clip(s?.body, 20000) }));
  if (out.some((s) => !s.heading || !s.body)) throw new Error("Every section needs a heading and text.");
  if (new Set(out.map((s) => s.heading.toLowerCase())).size !== out.length) throw new Error("Two sections have the same heading.");
  return out;
}

export type Draft = { revision: string; title: string; sections: Section[]; closing: string; summary: string; mandatory: boolean };

/** Publishes a new version. If `mandatory`, every approved member is emailed and must sign it at their next sign-in. */
export async function publish(d: Draft, who: string, base: string) {
  const c = await conn(), revision = clip(d.revision, 40), title = clip(d.title, 200), closing = clip(d.closing, 3000), summary = clip(d.summary, 6000), sections = check(d.sections);
  if (!revision || !title || !closing) throw new Error("Revision, title and closing statement are required.");
  const prev = await latestVersion();
  if (!diffVersions(prev, { sections, closing }).length && title === prev.title) throw new Error("Nothing has changed from the current version.");
  if (!summary) throw new Error("Describe what changed in plain language: members will read this.");
  if ((await c.query("SELECT 1 FROM waiver_versions WHERE lower(revision) = lower($1)", [revision])).rowCount) throw new Error(`Revision ${revision} already exists. Choose a new revision number.`);
  const id = (await c.query("INSERT INTO waiver_versions (revision, title, sections, closing, summary, mandatory, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [revision, title, JSON.stringify(sections), closing, summary, !!d.mandatory, who])).rows[0].id as number;
  await logAudit(who, "crm.waiver.publish", `Revision ${revision} (#${id})${d.mandatory ? ", all members must re-sign" : ""}`);
  if (d.mandatory) void notifyMembers(summary, diffVersions(prev, { sections, closing }), revision, base).catch(() => {});
  return id;
}

/** Emails every approved member that the agreement changed. Runs in the background, slowly, so one bad address or a rate limit can't stop the rest. */
async function notifyMembers(summary: string, ch: Change[], revision: string, base: string) {
  const cfg = await getMailCfg();
  if (!mailReady(cfg)) return;
  const people = (await (await conn()).query("SELECT name, email FROM site_users WHERE approval = 'approved' AND verified_at IS NOT NULL AND disabled_at IS NULL")).rows;
  const link = `${base}/login?next=${encodeURIComponent("/members/onboarding")}`, list = ch.slice(0, 12).map((c) => `${c.kind === "added" ? "New" : c.kind === "removed" ? "Removed" : "Edited"}: ${c.heading}`);
  for (const p of people) {
    await send({ to: p.email, subject: "We've updated the Kzoo Makers Membership Agreement: please review and sign",
      text: `Hi ${p.name},\n\nWe've updated the Kzoo Makers Membership Agreement (revision ${revision}). You need to review and sign the new version before you can keep using the members area.\n\nWhat changed:\n${summary}\n\n${list.join("\n")}\n\nReview and sign: ${link}`,
      html: `<p>Hi ${esc(p.name)},</p><p>We've updated the Kzoo Makers Membership Agreement (revision ${esc(revision)}). You need to review and sign the new version before you can keep using the members area.</p><p><strong>What changed</strong></p><p style="white-space:pre-wrap">${esc(summary)}</p><ul>${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p><a href="${link}">Review and sign</a></p>` }, cfg).catch(() => {});
    await new Promise((r) => setTimeout(r, 200));
  }
}

export type Signed = { doc_id: number; signed_at: string; version: Version };
/** Every version this person has signed, oldest first. */
export async function historyFor(userId: number): Promise<Signed[]> {
  return (await (await conn()).query(`SELECT d.id AS doc_id, d.completed_at AS signed_at, row_to_json(v) AS version FROM sign_docs d JOIN (SELECT ${COLS} FROM waiver_versions) v ON v.id = d.version_id
    WHERE d.user_id = $1 AND d.kind = 'waiver' AND d.status = 'complete' ORDER BY d.id`, [userId])).rows;
}

/** For the sign-again page: what changed since the version they last signed, and what each newer version's author said. */
export async function changesFor(userId: number) {
  const h = await historyFor(userId), cur = await latestVersion(), last = h.at(-1)?.version;
  if (!last || last.id === cur.id) return { cur, last: last ?? null, changes: [] as Change[], notes: [] as { revision: string; summary: string; at: string }[] };
  const newer = (await (await conn()).query("SELECT revision, summary, created_at AS at FROM waiver_versions WHERE id > $1 ORDER BY id", [last.id])).rows;
  return { cur, last, changes: diffVersions(last, cur), notes: newer as { revision: string; summary: string; at: string }[] };
}

/** Who is on which version (approved members). `version`: 'none' for unsigned, 'old' for behind the newest, or a version id. */
export async function members(q: string, version: string) {
  const like = "%" + clip(q, 80).replace(/[\\%_]/g, "\\$&") + "%";
  return (await (await conn()).query(`SELECT u.id, u.name, u.email, l.version_id, v.revision, l.completed_at AS signed_at, l.id AS doc_id, (${STEP_SQL}) = 'resign' AS must_resign
    FROM site_users u LEFT JOIN LATERAL (SELECT id, version_id, completed_at FROM sign_docs WHERE user_id = u.id AND kind = 'waiver' AND status = 'complete' ORDER BY id DESC LIMIT 1) l ON true
    LEFT JOIN waiver_versions v ON v.id = l.version_id
    WHERE u.approval = 'approved' AND u.verified_at IS NOT NULL AND (u.name ILIKE $1 OR u.email ILIKE $1)
      AND CASE WHEN $2 = '' THEN true WHEN $2 = 'none' THEN l.id IS NULL WHEN $2 = 'old' THEN l.id IS NULL OR l.version_id < (SELECT max(id) FROM waiver_versions) ELSE l.version_id = $2::int END
    ORDER BY lower(u.name) LIMIT 300`, [like, /^\d+$/.test(version) ? version : version === "none" || version === "old" ? version : ""])).rows as { id: number; name: string; email: string; version_id: number | null; revision: string | null; signed_at: string | null; doc_id: number | null; must_resign: boolean }[];
}

export { summarize };

/** Their own signed copy, only if it is theirs. */
export async function myPdf(userId: number, docId: number) {
  const r = (await (await conn()).query("SELECT pdf, title FROM sign_docs WHERE id = $1 AND user_id = $2 AND kind = 'waiver' AND status = 'complete'", [docId, userId])).rows[0];
  return r?.pdf ? { pdf: (await import("./vault")).open(r.pdf), title: r.title as string } : null;
}

/** For the Account page: each version they signed (newest first) with what changed from the one before, using the authors' plain-language notes plus the section diff. */
export async function accountView(userId: number) {
  const h = await historyFor(userId);
  if (!h.length) return null;
  const all = (await (await conn()).query("SELECT id, revision, summary, created_at AS at FROM waiver_versions ORDER BY id")).rows as { id: number; revision: string; summary: string; at: string }[];
  const cur = await latestVersion();
  return {
    current: h.at(-1)!.version.id === cur.id,
    latest: cur.revision,
    items: h.map((s, i) => {
      const prev = h[i - 1]?.version;
      return { ...s, prevRevision: prev?.revision ?? null, changes: prev ? diffVersions(prev, s.version) : [], notes: prev ? all.filter((v) => v.id > prev.id && v.id <= s.version.id) : [] };
    }).reverse(),
  };
}

const SYSTEM = `You explain changes to a makerspace's membership agreement to its members, in plain friendly words (8th-grade reading level, no legal jargon).
For each change write one bullet that starts with "- " and the section name, a colon, then 1 to 3 short sentences: what is different and what it means for a member.
Use only what the text says: never invent rules, dates or amounts. If a change is just wording or a typo fix, say so in one short sentence. No intro, no outro, no markdown besides the "- " bullets.`;

/** A plain-language summary of what this draft changes compared with the current version, written by the AI model chosen for this job. */
export async function aiSummary(d: Draft) {
  const prev = await latestVersion(), ch = diffVersions(prev, { sections: check(d.sections), closing: clip(d.closing, 3000) });
  if (!ch.length) throw new Error("Nothing has changed yet, so there is nothing to summarize.");
  return complete("agreement-summary", SYSTEM, `Here are the changes from the current agreement to the new draft:\n\n${changesPrompt(ch)}`);
}
