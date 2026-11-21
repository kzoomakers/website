import { adminFloor, conn } from "./db";
import { logAudit } from "./store";
import { MIN_ADMINS } from "./users";
import { disabledMsg } from "./readers";
import { joinMembersIfDone } from "./waiver";


// What a member can edit about themselves, and the extra fields only admins can edit.
export const SELF_FIELDS = ["first_name", "last_name", "phone", "address1", "address2", "city", "state", "zip", "gender", "pronouns"] as const;
export const ADMIN_FIELDS = [...SELF_FIELDS, "email", "access_card_number", "qb_id", "notes"] as const;
export const RELATIONSHIPS = ["Parent", "Sibling", "Friend", "Spouse", "Significant other", "Guardian", "Adult child", "Other"] as const;

const EMAIL_OK = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const phoneOk = (p: string) => /^[\d\s()+.\-x]{7,30}$/.test(p) && p.replace(/\D/g, "").length >= 7;

export type Profile = Record<(typeof ADMIN_FIELDS)[number], string> & { id: number; name: string; verified: boolean; has_password: boolean; created_at: string; disabled: boolean; disabled_reason: string };
export type Contact = { id: number; first_name: string; last_name: string; phone: string; relationship: string; address: string; business_phone: string };

export async function getProfile(id: number): Promise<Profile | null> {
  return (await (await conn()).query(
    `SELECT id, name, email, first_name, last_name, gender, pronouns, phone, address1, address2, city, state, zip, access_card_number, qb_id, notes,
            verified_at IS NOT NULL AS verified, password_hash IS NOT NULL AS has_password, created_at, disabled_at IS NOT NULL AS disabled, disabled_reason FROM site_users WHERE id = $1`, [id])).rows[0] ?? null;
}

/** Updates the allowed fields present in `patch`. Names are required; changing email checks the address and that nobody else has it. */
export async function updateProfile(id: number, patch: Record<string, unknown>, fields: readonly string[], who: string) {
  const c = await conn(), set: Record<string, string> = {};
  for (const f of fields) if (f in patch) set[f] = clip(patch[f], f === "notes" ? 2000 : f === "email" ? 200 : 120);
  if ("first_name" in set || "last_name" in set) {
    const cur = (await getProfile(id)) ?? (() => { throw new Error("No such user."); })();
    const first = set.first_name ?? cur.first_name, last = set.last_name ?? cur.last_name;
    if (!first) throw new Error("First name is required.");
    set.name = `${first} ${last}`.trim();
  }
  if ("email" in set) {
    set.email = set.email.toLowerCase();
    if (!EMAIL_OK.test(set.email)) throw new Error("That email address doesn't look right.");
    if ((await c.query("SELECT 1 FROM site_users WHERE email = $1 AND id <> $2", [set.email, id])).rowCount) throw new Error("Another account already uses that email.");
  }
  if ("phone" in set && set.phone && !phoneOk(set.phone)) throw new Error("That phone number doesn't look right.");
  const keys = Object.keys(set);
  if (!keys.length) return;
  const old = "email" in set ? (await c.query("SELECT email FROM site_users WHERE id = $1", [id])).rows[0]?.email : null;
  const r = await c.query(`UPDATE site_users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING email`, [id, ...keys.map((k) => set[k])]);
  if (!r.rowCount) throw new Error("No such user.");
  // Their mailing-list entry follows the new address (unless that address is already a subscriber).
  if (old && old !== set.email) await c.query("UPDATE mail_subscribers SET email = $2 WHERE email = $1 AND NOT EXISTS (SELECT 1 FROM mail_subscribers WHERE email = $2)", [old, set.email]);
  if (fields === ADMIN_FIELDS) await logAudit(who, "user.edit", `${r.rows[0].email}: ${keys.filter((k) => k !== "name").join(", ")}`);
  await joinMembersIfDone(id);
}

export const listContacts = async (userId: number): Promise<Contact[]> =>
  (await (await conn()).query("SELECT id, first_name, last_name, phone, relationship, address, business_phone FROM emergency_contacts WHERE user_id = $1 ORDER BY id", [userId])).rows;

/** Adds (no id) or edits one of the member's emergency contacts. Name, phone and relationship are required. */
export async function saveContact(userId: number, b: Record<string, unknown>) {
  const c = await conn();
  const v = { first_name: clip(b.first_name, 80), last_name: clip(b.last_name, 80), phone: clip(b.phone, 30), relationship: clip(b.relationship, 30), address: clip(b.address, 300), business_phone: clip(b.business_phone, 30) };
  if (!v.first_name || !v.last_name) throw new Error("A first and last name are required.");
  if (!phoneOk(v.phone)) throw new Error("A valid phone number is required.");
  if (v.business_phone && !phoneOk(v.business_phone)) throw new Error("That business phone number doesn't look right.");
  if (!(RELATIONSHIPS as readonly string[]).includes(v.relationship)) throw new Error("Please choose the relationship.");
  const vals = [v.first_name, v.last_name, v.phone, v.relationship, v.address, v.business_phone];
  if (Number.isInteger(b.id)) {
    if (!(await c.query("UPDATE emergency_contacts SET first_name=$3, last_name=$4, phone=$5, relationship=$6, address=$7, business_phone=$8 WHERE id = $2 AND user_id = $1", [userId, b.id, ...vals])).rowCount) throw new Error("No such contact.");
  } else {
    if ((await c.query("SELECT count(*)::int n FROM emergency_contacts WHERE user_id = $1", [userId])).rows[0].n >= 10) throw new Error("That's the maximum of 10 emergency contacts.");
    await c.query("INSERT INTO emergency_contacts (user_id, first_name, last_name, phone, relationship, address, business_phone) VALUES ($1,$2,$3,$4,$5,$6,$7)", [userId, ...vals]);
  }
  await joinMembersIfDone(userId);
}

export const deleteContact = async (userId: number, id: number) =>
  void (await (await conn()).query("DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2", [id, userId]));

/** Deletes a member and everything of theirs (comments, contacts, access). Never the founder, yourself, or one of the last MIN_ADMINS administrators. */
export async function deleteUser(id: number, who: string) {
  const u = await adminFloor(async (c) => {
    const u = (await c.query("SELECT email FROM site_users WHERE id = $1", [id])).rows[0];
    if (!u) return null;
    if (u.email.toLowerCase() === who.toLowerCase()) throw new Error("You can't delete your own account here.");
    if ((await c.query("SELECT 1 FROM user_perms WHERE user_id = $1 AND locked", [id])).rowCount) throw new Error("The founding administrator can't be deleted.");
    if ((await c.query("SELECT 1 FROM user_perms WHERE user_id = $1 AND section = 'system' AND level = 'write'", [id])).rowCount
      && (await c.query("SELECT count(*)::int n FROM user_perms p JOIN site_users s ON s.id = p.user_id WHERE p.section = 'system' AND p.level = 'write' AND s.disabled_at IS NULL")).rows[0].n <= MIN_ADMINS)
      throw new Error(`At least ${MIN_ADMINS} administrators must remain. Make someone else an administrator first.`);
    await c.query("DELETE FROM site_users WHERE id = $1", [id]);
    return u;
  });
  if (!u) return false;
  await logAudit(who, "user.delete", u.email);
  return true;
}

export type Person = { id: number; name: string; email: string; verified: boolean; contacts: number; card: string; disabled: boolean; approval: string; joined: string; levels: string[]; roster: boolean; waiver: boolean; tools: string[] };
export type PeopleQuery = { q?: string; sort?: string; dir?: string; status?: string; approval?: string; level?: string; flag?: string; offset?: number; limit?: number };
const SORTS: Record<string, string> = { name: "lower(u.name)", email: "lower(u.email)", joined: "u.created_at", card: "u.access_card_number", contacts: "contacts", approval: "u.approval", status: "u.disabled_at IS NOT NULL" };
const FLAGS: Record<string, string> = {
  no_contacts: "NOT EXISTS (SELECT 1 FROM emergency_contacts e WHERE e.user_id = u.id)", unverified: "u.verified_at IS NULL",
  no_roster: "NOT EXISTS (SELECT 1 FROM roster_photos r WHERE r.user_id = u.id)", no_waiver: "NOT EXISTS (SELECT 1 FROM sign_docs d WHERE d.user_id = u.id AND d.kind = 'waiver' AND d.status = 'complete')",
  no_membership: "NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)", no_card: "u.access_card_number = ''" };

/** Site accounts, filtered, sorted and paged (phone numbers are PII: neither shown nor searchable here). Every word typed must match the name, email, card number or QuickBooks id. */
export async function listPeople(o: PeopleQuery = {}): Promise<{ rows: Person[]; total: number }> {
  const ps: unknown[] = [], w: string[] = [], add = (v: unknown) => `$${ps.push(v)}`;
  for (const t of (o.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const p = add("%" + t.replace(/[\\%_]/g, "\\$&") + "%");
    w.push(`(u.name ILIKE ${p} OR u.email ILIKE ${p} OR u.access_card_number ILIKE ${p} OR u.qb_id ILIKE ${p})`);
  }
  if (o.status === "active") w.push("u.disabled_at IS NULL"); else if (o.status === "disabled") w.push("u.disabled_at IS NOT NULL");
  if (["pending", "waiting", "rejected", "approved"].includes(o.approval ?? "")) w.push(`u.approval = ${add(o.approval)}`);
  if (o.level === "__none") w.push(FLAGS.no_membership); else if (o.level) w.push(`EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.level = ${add(o.level)})`);
  if (o.flag && FLAGS[o.flag]) w.push(FLAGS[o.flag]);
  const W = w.length ? "WHERE " + w.join(" AND ") : "", c = await conn();
  const order = `${SORTS[o.sort ?? ""] ?? "u.created_at"} ${o.dir === "asc" ? "ASC" : "DESC"}, u.id DESC`;
  const lim = add(Math.min(Math.max(o.limit ?? 50, 1), 10000)), off = add(Math.max(o.offset ?? 0, 0));
  const [rows, total] = await Promise.all([
    c.query(`SELECT u.id, u.name, u.email, u.verified_at IS NOT NULL AS verified, u.access_card_number AS card, u.disabled_at IS NOT NULL AS disabled, u.approval, u.created_at AS joined,
        (SELECT count(*)::int FROM emergency_contacts e WHERE e.user_id = u.id) AS contacts,
        COALESCE((SELECT array_agg(m.level ORDER BY m.level) FROM memberships m WHERE m.user_id = u.id), '{}') AS levels,
        COALESCE((SELECT array_agg(t.name ORDER BY lower(t.name)) FROM tool_auths_effective a JOIN tools t ON t.id = a.tool_id WHERE a.user_id = u.id AND NOT a.expired), '{}') AS tools,
        EXISTS (SELECT 1 FROM roster_photos r WHERE r.user_id = u.id) AS roster,
        EXISTS (SELECT 1 FROM sign_docs d WHERE d.user_id = u.id AND d.kind = 'waiver' AND d.status = 'complete') AS waiver
      FROM site_users u ${W} ORDER BY ${order} LIMIT ${lim} OFFSET ${off}`, ps),
    c.query(`SELECT count(*)::int AS n FROM site_users u ${W}`, ps.slice(0, ps.length - 2))]);
  return { rows: rows.rows, total: total.rows[0].n };
}

/** Changing a person's email, password or account can take over that account, so people who hold admin access (any section) can only be touched by a full administrator. */
export async function mayTakeOver(callerIsAdmin: boolean, targetId: number) {
  return callerIsAdmin || !(await (await conn()).query("SELECT 1 FROM user_perms WHERE user_id = $1", [targetId])).rowCount;
}

/** Disables an account (reason = what they are told when they try to sign in; blank gives "Account is disabled") or, with null, enables it again. Existing sessions and unused links stop working at once. */
export async function setDisabled(id: number, reason: string | null, who: string) {
  // The account change is one transaction (so a crash can't leave it half-disabled).
  const u = await adminFloor(async (c) => {
  const u = (await c.query("SELECT email, disabled_at FROM site_users WHERE id = $1", [id])).rows[0];
  if (!u) return null;
  if (reason === null) {
    await c.query("UPDATE site_users SET disabled_at = NULL, disabled_reason = '' WHERE id = $1", [id]);
  } else {
    if (u.email.toLowerCase() === who.toLowerCase()) throw new Error("You can't disable your own account.");
    if ((await c.query("SELECT 1 FROM user_perms WHERE user_id = $1 AND locked", [id])).rowCount) throw new Error("The founding administrator can't be disabled.");
    if (!u.disabled_at && (await c.query("SELECT 1 FROM user_perms WHERE user_id = $1 AND section = 'system' AND level = 'write'", [id])).rowCount
      && (await c.query("SELECT count(*)::int n FROM user_perms p JOIN site_users s ON s.id = p.user_id WHERE p.section = 'system' AND p.level = 'write' AND s.disabled_at IS NULL")).rows[0].n <= MIN_ADMINS)
      throw new Error(`At least ${MIN_ADMINS} administrators must stay active. Make someone else an administrator first.`);
    const text = clip(reason, 300) === disabledMsg("") ? "" : clip(reason, 300);
    await c.query("UPDATE site_users SET disabled_at = COALESCE(disabled_at, now()), disabled_reason = $2 WHERE id = $1", [id, text]);
    await c.query("DELETE FROM login_tokens WHERE user_id = $1", [id]);
  }
  return u;
  });
  if (!u) return false;
  await logAudit(who, reason === null ? "user.enable" : "user.disable", u.email + (reason ? `: ${clip(reason, 300)}` : ""));
  return true;
}

// ---- Roster photo (internal use only) ----
export const hasRoster = async (id: number) => !!(await (await conn()).query("SELECT 1 FROM roster_photos WHERE user_id = $1", [id])).rowCount;
export const getRoster = async (id: number): Promise<Buffer | null> => (await (await conn()).query("SELECT data FROM roster_photos WHERE user_id = $1", [id])).rows[0]?.data ?? null;
/** Stores (data) or removes (null) the roster photo. */
export async function setRoster(id: number, data: Buffer | null, who: string) {
  const c = await conn();
  if (data) await c.query("INSERT INTO roster_photos (user_id, data, updated_by) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = now(), updated_by = $3", [id, data, who]);
  else await c.query("DELETE FROM roster_photos WHERE user_id = $1", [id]);
  await logAudit(who, data ? "user.roster_photo" : "user.roster_photo_removed", String((await c.query("SELECT email FROM site_users WHERE id = $1", [id])).rows[0]?.email ?? id));
}
