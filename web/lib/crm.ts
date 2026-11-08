import { db } from "./db";
import { getGuided, logAudit } from "./store";
import { getMailCfg, mailReady, send } from "./mail";
import { loginLink } from "./readers";
import { dropPhoto, storePhoto } from "./reviews";
import { notifyUser } from "./notifications";
import { s3 } from "./s3";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { FIELDS, type Fields } from "./fields";
import sharp from "sharp";

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const esc = (s: string) => s.replace(/[<>&"]/g, "");

// ---- Membership levels: the plans on the Pricing page --------------------------------------------------------------------------------
export async function planNames(): Promise<string[]> {
  return ((await getGuided("pricing"))?.plans ?? []).map((p: any) => String(p?.name ?? "").trim()).filter(Boolean);
}
export const memberships = async (userId: number): Promise<{ level: string; since: string }[]> =>
  (await (await conn()).query("SELECT level, since FROM memberships WHERE user_id = $1 ORDER BY since, level", [userId])).rows;

/** Sets which levels a member holds. New ones must be a plan on the Pricing page; a level that has since left that page can be kept or removed. */
export async function setMemberships(userId: number, levels: unknown, who: string) {
  const want = [...new Set((Array.isArray(levels) ? levels : []).map((l) => clip(l, 120)).filter(Boolean))];
  const c = await conn(), plans = await planNames(), have = (await memberships(userId)).map((m) => m.level);
  if (want.some((l) => !plans.includes(l) && !have.includes(l))) throw new Error("That level isn't on the Pricing page.");
  await c.query("DELETE FROM memberships WHERE user_id = $1 AND NOT (level = ANY($2))", [userId, want]);
  for (const l of want) await c.query("INSERT INTO memberships (user_id, level) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, l]);
  const e = (await c.query("SELECT email FROM site_users WHERE id = $1", [userId])).rows[0]?.email;
  await logAudit(who, "user.membership", `${e}: ${want.join(", ") || "none"}`);
}

// ---- Skills directory ----------------------------------------------------------------------------------------------------------------
export const SKILL_LEVELS = ["learning", "competent", "teach"] as const;
export type MySkill = { name: string; level: (typeof SKILL_LEVELS)[number]; note: string };

export async function mySkills(userId: number) {
  const c = await conn();
  const u = (await c.query("SELECT directory_optin AS optin, show_phone, show_email, bio, photo FROM site_users WHERE id = $1", [userId])).rows[0];
  const skills: MySkill[] = (await c.query("SELECT s.name, m.level, m.note FROM member_skills m JOIN skills s ON s.id = m.skill_id WHERE m.user_id = $1 ORDER BY lower(s.name)", [userId])).rows;
  return { ...u, skills, fields: await myFields(userId) };
}

export { FIELDS, type Fields } from "./fields";
async function myFields(userId: number): Promise<Fields> {
  const out: Fields = {};
  for (const r of (await (await conn()).query("SELECT field, value FROM member_fields WHERE user_id = $1 ORDER BY lower(value)", [userId])).rows) (out[r.field] ??= []).push(r.value);
  return out;
}

/** Replaces a member's listing: opt-in, bio and skill list (new skill names are added to the shared list; admins tidy it later). */
export async function setMySkills(userId: number, b: { optin?: unknown; show_phone?: unknown; show_email?: unknown; bio?: unknown; skills?: unknown; fields?: unknown }) {
  const items = (Array.isArray(b.skills) ? b.skills : []) as any[];
  if (items.length > 20) throw new Error("That's the maximum of 20 skills.");
  const seen = new Set<string>(), rows: MySkill[] = [];
  for (const i of items) {
    const name = clip(i?.name, 40).replace(/\s+/g, " ");
    if (name.length < 2) throw new Error("Skill names need at least 2 characters.");
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    rows.push({ name, level: (SKILL_LEVELS as readonly string[]).includes(i?.level) ? i.level : "competent", note: clip(i?.note, 140) });
  }
  const fieldRows: [string, string][] = [];
  for (const k of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
    const raw = (b.fields as any)?.[k], vals = [...new Map((Array.isArray(raw) ? raw : []).map((v) => clip(v, 60).replace(/\s+/g, " ")).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()];
    if (vals.length > (FIELDS[k].multi ? 20 : 1)) throw new Error(`Too many entries for ${FIELDS[k].label}.`);
    for (const v of vals) fieldRows.push([k, v]);
  }
  const cl = await (await conn()).connect();
  try {
    await cl.query("BEGIN");
    await cl.query("DELETE FROM member_fields WHERE user_id = $1", [userId]);
    for (const [f, v] of fieldRows) await cl.query("INSERT INTO member_fields (user_id, field, value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [userId, f, v]);
    await cl.query("UPDATE site_users SET directory_optin = $2, bio = $3, show_phone = $4, show_email = $5 WHERE id = $1", [userId, !!b.optin, clip(b.bio, 500), !!b.show_phone, !!b.show_email]);
    await cl.query("DELETE FROM member_skills WHERE user_id = $1", [userId]);
    for (const r of rows) {
      await cl.query("INSERT INTO skills (name) VALUES ($1) ON CONFLICT ((lower(name))) DO NOTHING", [r.name]);
      await cl.query("INSERT INTO member_skills (user_id, skill_id, level, note) SELECT $1, id, $3, $4 FROM skills WHERE lower(name) = lower($2)", [userId, r.name, r.level, r.note]);
    }
    await cl.query("COMMIT");
  } catch (e) { await cl.query("ROLLBACK"); throw e; } finally { cl.release(); }
}

export const skillNames = async (): Promise<string[]> => (await (await conn()).query("SELECT name FROM skills ORDER BY lower(name) LIMIT 1000")).rows.map((r) => r.name);

export type Listing = { id: number; name: string; bio: string; photo: string; phone: string; email: string; skills: MySkill[]; fields: Fields };
const LISTED = "u.directory_optin AND u.disabled_at IS NULL AND u.verified_at IS NOT NULL";

/** Members who opted in. Only first name + last initial, bio, skills and profile facts are shown (plus phone/email if that member ticked them); contact goes through a message relay.
 *  `level`: help = competent or teach, teach = teach only. `filters`: exact match on a FIELDS key. Free text searches names, bio, skills and every fact. */
export async function searchDirectory(q: string, level: string, filters: Record<string, unknown> = {}): Promise<Listing[]> {
  const like = "%" + q.trim().replace(/[\\%_]/g, "\\$&") + "%", min = level === "teach" ? ["teach"] : level === "help" ? ["competent", "teach"] : level ? ["learning", "competent", "teach"] : null;
  const args: unknown[] = [q.trim(), min, like], where: string[] = [];
  for (const k of Object.keys(FIELDS)) {
    const v = clip(filters[k], 60);
    if (v) { args.push(k, v); where.push(`EXISTS (SELECT 1 FROM member_fields f WHERE f.user_id = u.id AND f.field = $${args.length - 1} AND lower(f.value) = lower($${args.length}))`); }
  }
  return (await (await conn()).query(
    `SELECT u.id, btrim(u.first_name || ' ' || left(u.last_name, 1) || CASE WHEN u.last_name = '' THEN '' ELSE '.' END) AS name, u.bio, u.photo,
       CASE WHEN u.show_phone THEN u.phone ELSE '' END AS phone, CASE WHEN u.show_email THEN u.email ELSE '' END AS email,
       COALESCE((SELECT json_agg(json_build_object('name', s.name, 'level', m.level, 'note', m.note) ORDER BY lower(s.name)) FROM member_skills m JOIN skills s ON s.id = m.skill_id WHERE m.user_id = u.id), '[]') AS skills,
       COALESCE((SELECT json_object_agg(field, vals) FROM (SELECT field, json_agg(value ORDER BY lower(value)) AS vals FROM member_fields WHERE user_id = u.id GROUP BY field) x), '{}') AS fields
     FROM site_users u
     WHERE ${LISTED}
       AND ($2::text[] IS NULL OR EXISTS (SELECT 1 FROM member_skills m WHERE m.user_id = u.id AND m.level = ANY($2)))
       AND ($1 = '' OR u.first_name ILIKE $3 OR u.bio ILIKE $3
            OR EXISTS (SELECT 1 FROM member_skills m JOIN skills s ON s.id = m.skill_id WHERE m.user_id = u.id AND (s.name ILIKE $3 OR m.note ILIKE $3))
            OR EXISTS (SELECT 1 FROM member_fields f WHERE f.user_id = u.id AND f.value ILIKE $3))
       ${where.map((w) => "AND " + w).join(" ")}
     ORDER BY lower(u.first_name) LIMIT 60`, args)).rows;
}

/** Which search dimensions have anything to filter on among listed members; the directory only shows those. */
export async function directoryFacets() {
  const c = await conn();
  const [f, sk] = await Promise.all([
    c.query(`SELECT f.field, f.value FROM member_fields f JOIN site_users u ON u.id = f.user_id WHERE ${LISTED} GROUP BY f.field, f.value ORDER BY f.field, lower(f.value) LIMIT 500`),
    c.query(`SELECT 1 FROM member_skills m JOIN site_users u ON u.id = m.user_id WHERE ${LISTED} LIMIT 1`)]);
  const fields: Fields = {};
  for (const r of f.rows) if (r.field in FIELDS) (fields[r.field] ??= []).push(r.value);
  return { fields, skills: !!sk.rowCount };
}

const NAME_SQL = "btrim(u.first_name || ' ' || left(u.last_name, 1) || CASE WHEN u.last_name = '' THEN '' ELSE '.' END)";

/** Sends a message to a listed member: it lands in their in-app inbox (a conversation they can answer there) and is emailed with a one-time link
 *  that signs them in and opens the conversation. Their address is never shared; the sender must be listed too. First contact is limited to 2 a day per person, 5 an hour overall. */
export async function messageMember(fromId: number, toId: number, bodyIn: string, base: string) {
  const body = clip(bodyIn, 2000), c = await conn(), cfg = await getMailCfg();
  if (body.length < 5) throw new Error("Please write a message.");
  if (fromId === toId) throw new Error("That's you!");
  const [a, b] = await Promise.all([fromId, toId].map(async (id) => (await c.query("SELECT email, name, first_name, directory_optin FROM site_users WHERE id = $1 AND disabled_at IS NULL AND verified_at IS NOT NULL", [id])).rows[0]));
  if (!a?.directory_optin) throw new Error("Add yourself to the directory first (My Profile), so members can write back.");
  if (!b?.directory_optin) throw new Error("That member isn't in the directory.");
  const replying = !!(await c.query("SELECT 1 FROM member_messages WHERE from_id = $1 AND to_id = $2 AND body <> ''", [toId, fromId])).rowCount;
  if ((await c.query("SELECT count(*)::int n FROM member_messages WHERE from_id = $1 AND at > now() - interval '1 hour'", [fromId])).rows[0].n >= (replying ? 30 : 5)
    || (await c.query("SELECT count(*)::int n FROM member_messages WHERE from_id = $1 AND to_id = $2 AND at > now() - interval '1 day'", [fromId, toId])).rows[0].n >= (replying ? 30 : 2))
    throw new Error("You've sent a lot of messages. Please try again later.");
  await c.query("INSERT INTO member_messages (from_id, to_id, body) VALUES ($1,$2,$3)", [fromId, toId, body]);
  const path = `/members/inbox/${fromId}`;
  await notifyUser(toId, { kind: "member.message", title: `${a.name} wrote to you`, body, url: path }).catch(() => {});
  // The message is already in their inbox, so an email problem must not make the send look failed.
  if (!mailReady(cfg)) return;
  await loginLink(toId, path, base).then((link) => send({ to: b.email, subject: `${a.name} wrote to you on the Kzoo Makers site`,
    text: `Hi ${b.first_name},\n\n${a.name} wrote to you through the Kzoo Makers member directory:\n\n${body}\n\nTo reply, open this link. It signs you in and takes you straight to the conversation (works once, for 7 days; after that, sign in and open Members > Inbox):\n\n${link}\n\nYour email address stays private. You can hide yourself from the directory any time under Members > My Profile.`,
    html: `<p>Hi ${esc(b.first_name)},</p><p>${esc(a.name)} wrote to you through the Kzoo Makers member directory:</p><blockquote style="white-space:pre-wrap">${esc(body)}</blockquote><p><a href="${link}"><b>Reply here</b></a>: it signs you in and takes you straight to the conversation (the link works once, for 7 days; after that, sign in and open Members &rsaquo; Inbox).</p><p>Your email address stays private. You can hide yourself from the directory any time under Members &rsaquo; My Profile.</p>` }, cfg)).catch(() => {});
}

export type Conversation = { id: number; name: string; body: string; at: string; mine: boolean; unread: number };
export type ThreadMessage = { id: number; mine: boolean; body: string; at: string };

/** One row per person you've exchanged messages with, newest first. */
export async function conversations(userId: number): Promise<Conversation[]> {
  return (await (await conn()).query(
    `WITH m AS (SELECT id, CASE WHEN from_id = $1 THEN to_id ELSE from_id END AS other, from_id, body, at, (to_id = $1 AND read_at IS NULL) AS unread
                FROM member_messages WHERE (from_id = $1 OR to_id = $1) AND body <> '')
     SELECT l.other AS id, ${NAME_SQL} AS name, l.body, l.at, l.from_id = $1 AS mine, (SELECT count(*)::int FROM m WHERE m.other = l.other AND m.unread) AS unread
     FROM (SELECT DISTINCT ON (other) * FROM m ORDER BY other, id DESC) l JOIN site_users u ON u.id = l.other ORDER BY l.at DESC LIMIT 50`, [userId])).rows;
}

/** Your conversation with one person (oldest first, last 200); opening it marks their messages and its notification read. null if there's nothing between you. */
export async function thread(userId: number, otherId: number) {
  const c = await conn();
  const rows = (await c.query("SELECT id, from_id = $1 AS mine, body, at FROM member_messages WHERE body <> '' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)) ORDER BY id DESC LIMIT 200", [userId, otherId])).rows as ThreadMessage[];
  if (!rows.length) return null;
  await Promise.all([
    c.query("UPDATE member_messages SET read_at = now() WHERE to_id = $1 AND from_id = $2 AND read_at IS NULL", [userId, otherId]),
    c.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND url = $2 AND read_at IS NULL", [userId, `/members/inbox/${otherId}`])]);
  const u = (await c.query(`SELECT ${NAME_SQL} AS name, (directory_optin AND disabled_at IS NULL) AS open FROM site_users u WHERE id = $1`, [otherId])).rows[0];
  return { name: u?.name ?? "Former member", canReply: !!u?.open, messages: rows.reverse() };
}

/** Values already used by listed members, most common first, so the profile can suggest them (keeps "Kalamazoo" from becoming "kzoo"). */
export async function fieldSuggestions(): Promise<Fields> {
  const out: Fields = {};
  for (const r of (await (await conn()).query(`SELECT f.field, f.value FROM member_fields f JOIN site_users u ON u.id = f.user_id WHERE ${LISTED} GROUP BY f.field, f.value ORDER BY count(*) DESC, lower(f.value) LIMIT 600`)).rows)
    if (r.field in FIELDS) (out[r.field] ??= []).push(r.value);
  return out;
}

// Admin: tidy profile values (occupation, company, city…).
export const listFieldValues = async () => (await (await conn()).query("SELECT field, value, count(*)::int AS members FROM member_fields GROUP BY field, value ORDER BY field, lower(value)")).rows as { field: string; value: string; members: number }[];
/** Renames a value for everyone who has it; renaming onto an existing value merges them. */
export async function renameFieldValue(field: string, from: string, toIn: string) {
  const to = clip(toIn, 60).replace(/\s+/g, " ");
  if (!(field in FIELDS)) throw new Error("Unknown field.");
  if (!to) throw new Error("Enter the new value.");
  const cl = await (await conn()).connect();
  try {
    await cl.query("BEGIN");
    await cl.query("DELETE FROM member_fields f WHERE field = $1 AND value = $2 AND EXISTS (SELECT 1 FROM member_fields g WHERE g.user_id = f.user_id AND g.field = $1 AND g.value = $3)", [field, from, to]); // they already have the target
    await cl.query("UPDATE member_fields SET value = $3 WHERE field = $1 AND value = $2", [field, from, to]);
    await cl.query("COMMIT");
  } catch (e) { await cl.query("ROLLBACK"); throw e; } finally { cl.release(); }
}
export async function deleteFieldValue(field: string, value: string) {
  if (!(field in FIELDS)) throw new Error("Unknown field.");
  await (await conn()).query("DELETE FROM member_fields WHERE field = $1 AND value = $2", [field, value]);
}

// Admin: tidy the shared skill list.
export const listSkills = async () => (await (await conn()).query("SELECT s.id, s.name, count(m.user_id)::int AS members FROM skills s LEFT JOIN member_skills m ON m.skill_id = s.id GROUP BY s.id ORDER BY lower(s.name)")).rows;
export async function renameSkill(id: number, name: string) {
  const n = clip(name, 40);
  if (n.length < 2) throw new Error("Skill names need at least 2 characters.");
  try { if (!(await (await conn()).query("UPDATE skills SET name = $2 WHERE id = $1", [id, n])).rowCount) throw new Error("No such skill."); } catch (e: any) { throw new Error(e.code === "23505" ? "A skill with that name exists: merge them instead." : e.message); }
}
export const deleteSkill = async (id: number) => void (await (await conn()).query("DELETE FROM skills WHERE id = $1", [id]));
export async function mergeSkills(id: number, into: number) {
  if (id === into) throw new Error("Pick a different skill to merge into.");
  const c = await conn();
  await c.query("INSERT INTO member_skills (user_id, skill_id, level, note) SELECT user_id, $2, level, note FROM member_skills WHERE skill_id = $1 ON CONFLICT DO NOTHING", [id, into]);
  await c.query("DELETE FROM skills WHERE id = $1", [id]);
}

// ---- Tools and authorizations --------------------------------------------------------------------------------------------------------
export type Tool = { id: number; name: string; category: string; description: string };
export const listTools = async () => (await (await conn()).query("SELECT t.id, t.name, t.category, t.description, count(a.user_id)::int AS authorized FROM tools t LEFT JOIN tool_auths a ON a.tool_id = t.id GROUP BY t.id ORDER BY lower(t.category), lower(t.name)")).rows;
export async function saveTool(b: any) {
  const name = clip(b?.name, 80);
  if (!name) throw new Error("A tool needs a name.");
  const v = [name, clip(b?.category, 60), clip(b?.description, 500)], c = await conn();
  try {
    if (Number.isInteger(b?.id)) await c.query("UPDATE tools SET name=$2, category=$3, description=$4 WHERE id = $1", [b.id, ...v]);
    else await c.query("INSERT INTO tools (name, category, description) VALUES ($1,$2,$3)", v);
  } catch (e: any) { throw new Error(e.code === "23505" ? "A tool with that name already exists." : e.message); }
}
export const deleteTool = async (id: number) => void (await (await conn()).query("DELETE FROM tools WHERE id = $1", [id]));

export type Auth = { tool_id: number; name: string; category: string; granted_by: string; granted_at: string; expires_on: string | null; note: string; expired: boolean };
export const authsFor = async (userId: number): Promise<Auth[]> =>
  (await (await conn()).query(`SELECT a.tool_id, t.name, t.category, a.granted_by, a.granted_at, to_char(a.expires_on, 'YYYY-MM-DD') AS expires_on, a.note, COALESCE(a.expires_on < current_date, false) AS expired
    FROM tool_auths a JOIN tools t ON t.id = a.tool_id WHERE a.user_id = $1 ORDER BY lower(t.category), lower(t.name)`, [userId])).rows;
export async function grantAuth(userId: number, toolId: number, expires: unknown, note: unknown, who: string) {
  const exp = typeof expires === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null, c = await conn();
  const t = (await c.query("SELECT name FROM tools WHERE id = $1", [toolId])).rows[0], u = (await c.query("SELECT email FROM site_users WHERE id = $1", [userId])).rows[0];
  if (!t || !u) throw new Error("No such tool or member.");
  await c.query(`INSERT INTO tool_auths (user_id, tool_id, granted_by, granted_at, expires_on, note) VALUES ($1,$2,$3, now(), $4, $5)
    ON CONFLICT (user_id, tool_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = now(), expires_on = EXCLUDED.expires_on, note = EXCLUDED.note`, [userId, toolId, who, exp, clip(note, 200)]);
  await logAudit(who, "user.authorize", `${u.email}: ${t.name}${exp ? " until " + exp : ""}`);
}
export async function revokeAuth(userId: number, toolId: number, who: string) {
  const r = (await (await conn()).query("DELETE FROM tool_auths a USING tools t, site_users u WHERE a.user_id = $1 AND a.tool_id = $2 AND t.id = a.tool_id AND u.id = a.user_id RETURNING t.name, u.email", [userId, toolId])).rows[0];
  if (r) await logAudit(who, "user.deauthorize", `${r.email}: ${r.name}`);
}

// ---- Classes -------------------------------------------------------------------------------------------------------------------------
export type Klass = { id: number; title: string; description: string; starts_at: string; ends_at: string | null; location: string; instructor: string; capacity: number; price: string; cancelled: boolean; image: string; level: string; summary: string; prerequisites: string; materials: string; signed: number; mine: "confirmed" | "waitlist" | null };
const CLASS_COLS = `c.id, c.title, c.description, c.starts_at, c.ends_at, c.location, c.instructor, c.capacity, c.price, c.cancelled, c.image, c.level, c.summary, c.prerequisites, c.materials,
  (SELECT count(*)::int FROM class_signups s WHERE s.class_id = c.id) AS signed,
  (SELECT CASE WHEN c.capacity = 0 OR x.rn <= c.capacity THEN 'confirmed' ELSE 'waitlist' END
   FROM (SELECT user_id, row_number() OVER (ORDER BY created_at, user_id) rn FROM class_signups WHERE class_id = c.id) x WHERE x.user_id = $1) AS mine`;

/** Upcoming classes for a member, with their own status: first `capacity` sign-ups are confirmed, later ones wait and move up when someone cancels. */
export const upcomingClasses = async (userId: number): Promise<Klass[]> =>
  (await (await conn()).query(`SELECT ${CLASS_COLS} FROM classes c WHERE NOT c.cancelled AND c.starts_at > now() - interval '2 hours' ORDER BY c.starts_at`, [userId])).rows;
export const allClasses = async (): Promise<Klass[]> =>
  (await (await conn()).query(`SELECT ${CLASS_COLS} FROM classes c ORDER BY c.starts_at DESC LIMIT 200`, [0])).rows;
export async function signUp(userId: number, classId: number) {
  const r = await (await conn()).query("INSERT INTO class_signups (class_id, user_id) SELECT id, $2 FROM classes WHERE id = $1 AND NOT cancelled AND starts_at > now() ON CONFLICT DO NOTHING", [classId, userId]);
  if (!r.rowCount && !(await (await conn()).query("SELECT 1 FROM class_signups WHERE class_id = $1 AND user_id = $2", [classId, userId])).rowCount) throw new Error("That class isn't open for sign-up.");
}
export const cancelSignUp = async (userId: number, classId: number) => void (await (await conn()).query("DELETE FROM class_signups WHERE class_id = $1 AND user_id = $2", [classId, userId]));
export const LEVELS = ["all", "beginner", "intermediate", "advanced"];
const artUrl = (v: unknown) => (typeof v === "string" && /^\/uploads\/class-art\/[\w-]+\.jpg$/.test(v) ? v : "");
export async function saveClass(b: any): Promise<number | void> {
  const title = clip(b?.title, 120), starts = new Date(b?.starts_at), ends = b?.ends_at ? new Date(b.ends_at) : null;
  if (!title) throw new Error("A class needs a title.");
  if (isNaN(+starts) || (ends && (isNaN(+ends) || ends < starts))) throw new Error("Check the start and end times.");
  const cap = Math.max(0, Math.min(500, Math.floor(Number(b?.capacity) || 0)));
  const v = [title, clip(b?.description, 2000), starts.toISOString(), ends?.toISOString() ?? null, clip(b?.location, 120), clip(b?.instructor, 120), cap, clip(b?.price, 60), !!b?.cancelled, artUrl(b?.image), LEVELS.includes(b?.level) ? b.level : "all", clip(b?.summary, 160), clip(b?.prerequisites, 300), clip(b?.materials, 300)], c = await conn();
  if (Number.isInteger(b?.id)) await c.query("UPDATE classes SET title=$2, description=$3, starts_at=$4, ends_at=$5, location=$6, instructor=$7, capacity=$8, price=$9, cancelled=$10, image=$11, level=$12, summary=$13, prerequisites=$14, materials=$15 WHERE id = $1", [b.id, ...v]);
  else return (await c.query("INSERT INTO classes (title, description, starts_at, ends_at, location, instructor, capacity, price, cancelled, image, level, summary, prerequisites, materials) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id", v)).rows[0].id as number;
}
export const deleteClass = async (id: number) => void (await (await conn()).query("DELETE FROM classes WHERE id = $1", [id]));
export const roster = async (classId: number) =>
  (await (await conn()).query(`SELECT u.id, u.name, u.email, u.phone, s.created_at, row_number() OVER (ORDER BY s.created_at, s.user_id)::int AS pos
    FROM class_signups s JOIN site_users u ON u.id = s.user_id WHERE s.class_id = $1 ORDER BY s.created_at, s.user_id`, [classId])).rows;
export const memberClasses = async (userId: number) =>
  (await (await conn()).query(`SELECT c.id, c.title, c.starts_at FROM class_signups s JOIN classes c ON c.id = s.class_id WHERE s.user_id = $1 ORDER BY c.starts_at DESC LIMIT 20`, [userId])).rows;

/** Sets (or with null removes) the member's directory photo; the previous file is deleted. */
export async function setMyPhoto(userId: number, file: File | null) {
  const c = await conn(), url = file ? await storePhoto(file) : "";
  const old = (await c.query("SELECT photo FROM site_users WHERE id = $1", [userId])).rows[0]?.photo;
  await c.query("UPDATE site_users SET photo = $2 WHERE id = $1", [userId, url]);
  if (old) await dropPhoto(old);
  return url;
}


// ---- Class art and proposals ---------------------------------------------------------------------------------------------------------
/** Poster art for a class: validated, shrunk to at most 1400px wide and stored under class-art/. Returns its /uploads URL. */
export async function storeArt(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new Error("The artwork must be a JPG, PNG, WebP or GIF image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is too large (8MB max).");
  const store = s3();
  if (!store) throw new Error("Image uploads aren't available right now.");
  const body = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer().catch(() => { throw new Error("That image couldn't be read."); });
  const key = `class-art/${randomUUID()}.jpg`;
  await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: body, ContentType: "image/jpeg" }));
  return `/uploads/${key}`;
}
const dropArt = async (url: string) => { const st = s3(); if (st && artUrl(url)) await st.client.send(new DeleteObjectCommand({ Bucket: st.bucket, Key: url.replace(/^\/uploads\//, "") })).catch(() => {}); };

/** How many days ahead a member must propose a class (CRM-admin setting, default 30). */
export async function classMinDays(): Promise<number> {
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = 'class_rules'");
  const n = Number(r.rows[0]?.data?.minDays);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}
export async function setClassMinDays(n: unknown, who: string) {
  const d = Math.floor(Number(n));
  if (!(d >= 0 && d <= 365)) throw new Error("Enter a number of days from 0 to 365.");
  await (await conn()).query("INSERT INTO settings (key, data) VALUES ('class_rules', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ minDays: d })]);
  await logAudit(who, "crm.classMinDays", `${d} days`);
}

export type Proposal = { id: number; user_id: number; name: string; email: string; title: string; summary: string; description: string; level: string; duration_min: number; capacity: number; price: string; materials: string; prerequisites: string; starts_at: string; location: string; image: string; notes: string; status: "pending" | "approved" | "declined"; reason: string; class_id: number | null; created_at: string };
const PCOLS = "p.*, u.name, u.email";

export async function proposeClass(user: { id: number; name: string }, b: any) {
  const c = await conn(), title = clip(b?.title, 120), starts = new Date(b?.starts_at), days = await classMinDays();
  if (!title) throw new Error("Give your class a title.");
  if (isNaN(+starts)) throw new Error("Pick a date and time.");
  if (+starts < Date.now() + days * 86400000) throw new Error(`Classes must be proposed at least ${days} days ahead, so pick a date on or after ${new Date(Date.now() + days * 86400000).toLocaleDateString([], { dateStyle: "long" })}.`);
  if (clip(b?.description, 2000).length < 40) throw new Error("Tell people what they'll do and learn (a few sentences).");
  if ((await c.query("SELECT count(*)::int n FROM class_proposals WHERE user_id = $1 AND status = 'pending'", [user.id])).rows[0].n >= 3) throw new Error("You have 3 proposals waiting for review. Wait for a decision before sending another.");
  const level = LEVELS.includes(b?.level) ? b.level : "all", dur = Math.max(15, Math.min(720, Math.floor(Number(b?.duration_min) || 120))), cap = Math.max(0, Math.min(500, Math.floor(Number(b?.capacity) || 0)));
  const id = (await c.query(`INSERT INTO class_proposals (user_id, title, summary, description, level, duration_min, capacity, price, materials, prerequisites, starts_at, location, image, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [user.id, title, clip(b?.summary, 160), clip(b?.description, 2000), level, dur, cap, clip(b?.price, 60), clip(b?.materials, 300), clip(b?.prerequisites, 300), starts.toISOString(), clip(b?.location, 120), artUrl(b?.image), clip(b?.notes, 500)])).rows[0].id;
  const admins = (await c.query("SELECT DISTINCT user_id FROM user_perms WHERE section = 'crm' OR (section = 'admin' AND level = 'write')")).rows;
  await Promise.all(admins.map((a) => notifyUser(a.user_id, { kind: "class.proposal", title: `${user.name} proposed a class: ${title}`, url: "/admin/crm/classes" }).catch(() => {})));
  return id;
}
export const myProposals = async (userId: number): Promise<Proposal[]> =>
  (await (await conn()).query(`SELECT ${PCOLS} FROM class_proposals p JOIN site_users u ON u.id = p.user_id WHERE p.user_id = $1 ORDER BY p.id DESC LIMIT 30`, [userId])).rows;
export const listProposals = async (status: string): Promise<Proposal[]> =>
  (await (await conn()).query(`SELECT ${PCOLS} FROM class_proposals p JOIN site_users u ON u.id = p.user_id WHERE p.status = $1 ORDER BY p.id DESC LIMIT 200`, [status])).rows;
export const proposalCounts = async (): Promise<Record<string, number>> =>
  Object.fromEntries((await (await conn()).query("SELECT status, count(*)::int AS n FROM class_proposals GROUP BY status")).rows.map((r) => [r.status, r.n]));
/** A member withdraws their own waiting proposal. */
export async function withdrawProposal(userId: number, id: number) {
  const r = (await (await conn()).query("DELETE FROM class_proposals WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING image", [id, userId])).rows[0];
  if (r?.image) await dropArt(r.image);
}

/** Admin decision. Approving creates the class (the admin may adjust anything first) and tells the proposer. */
export async function decideProposal(id: number, action: "approve" | "decline", edit: any, reason: string, who: string) {
  const c = await conn(), p = (await c.query(`SELECT ${PCOLS} FROM class_proposals p JOIN site_users u ON u.id = p.user_id WHERE p.id = $1`, [id])).rows[0] as Proposal | undefined;
  if (!p || p.status !== "pending") throw new Error("That proposal was already decided.");
  if (action === "decline") {
    const why = clip(reason, 500);
    if (!why) throw new Error("Say why, so the member can improve it.");
    await c.query("UPDATE class_proposals SET status='declined', reason=$2, decided_at=now(), decided_by=$3 WHERE id=$1", [id, why, who]);
    await notifyUser(p.user_id, { kind: "class.declined", title: `Your class “${p.title}” wasn't approved`, body: why, url: "/members/classes" });
    return;
  }
  const e = edit ?? {}, starts = new Date(e.starts_at ?? p.starts_at);
  if (isNaN(+starts)) throw new Error("Check the start time.");
  const ends = e.ends_at ? new Date(e.ends_at) : new Date(+starts + p.duration_min * 60000);
  const classId = (await saveClass({ title: e.title ?? p.title, summary: p.summary, description: e.description ?? p.description, starts_at: starts, ends_at: ends, location: e.location ?? p.location, instructor: p.name,
    capacity: e.capacity ?? p.capacity, price: e.price ?? p.price, image: p.image, level: p.level, prerequisites: p.prerequisites, materials: p.materials })) as number;
  await c.query("UPDATE class_proposals SET status='approved', class_id=$2, decided_at=now(), decided_by=$3 WHERE id=$1", [id, classId, who]);
  await notifyUser(p.user_id, { kind: "class.approved", title: `Your class “${p.title}” is approved!`, body: `It's on the schedule for ${starts.toLocaleDateString([], { dateStyle: "long" })}. Members can sign up now.`, url: "/members/classes" });
}
