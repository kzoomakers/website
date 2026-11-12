import { adminFloor, conn } from "./db";
import { PAGES, SECTIONS, type Perms } from "./access";
import { logAudit } from "./store";

export type UserRow = { id: number; email: string; name: string; perms: Perms; founder: boolean; disabled: boolean };
export const MIN_ADMINS = 3;


/** Verified site accounts matching a name/email search (people who already have access first). Capped at 50; search to find the rest. */
export async function listUsers(q: string): Promise<UserRow[]> {
  const like = "%" + q.trim().replace(/[\\%_]/g, "\\$&") + "%";
  return (await (await conn()).query(
    `SELECT u.id, u.email, u.name, COALESCE(jsonb_object_agg(p.section, p.level) FILTER (WHERE p.section IS NOT NULL), '{}') AS perms, COALESCE(bool_or(p.locked), false) AS founder, u.disabled_at IS NOT NULL AS disabled
     FROM site_users u LEFT JOIN user_perms p ON p.user_id = u.id
     WHERE u.verified_at IS NOT NULL AND ($1 = '' OR u.email ILIKE $2 OR u.name ILIKE $2)
     GROUP BY u.id ORDER BY count(p.section) > 0 DESC, lower(u.name) LIMIT 50`, [q.trim(), like])).rows;
}

/** Sets (or with level=null removes) one user's access to a whole section ("tours") or to one page of it ("tours:walkups"). Giving a whole section replaces any single pages they had in it.
 *  Returns the user's email, or null if there is no such user. */
export async function setAccess(userId: number, section: string, level: string | null, who: string) {
  const [sec, page] = section.split(":");
  if (!(SECTIONS as readonly string[]).includes(sec) || (page !== undefined && !PAGES.some((p) => p.section === sec && p.key === page && !p.full)) || (level !== null && level !== "read" && level !== "write")) throw new Error("bad section or level");
  const u = await adminFloor(async (c) => {
  const u = (await c.query("SELECT email FROM site_users WHERE id = $1 AND verified_at IS NOT NULL", [userId])).rows[0];
  if (!u) return null;
  // Changing your own Admin access could lock the last admin out; ask another admin (or use the Google admin login).
  if (section === "admin" && u.email.toLowerCase() === who.toLowerCase()) throw new Error("You can't change your own Admin access.");
  const cur = (await c.query("SELECT level, locked FROM user_perms WHERE user_id = $1 AND section = $2", [userId, section])).rows[0];
  if ((await c.query("SELECT 1 FROM user_perms WHERE user_id = $1 AND locked", [userId])).rowCount) throw new Error("The founding administrator can't be changed.");
  if (page !== undefined) { // one page: pointless (and confusing) if they already have the whole section
    if (level && (await c.query("SELECT 1 FROM user_perms WHERE user_id = $1 AND section = $2", [userId, sec])).rowCount) throw new Error("They already have access to the whole section. Remove that first to choose single pages.");
    if (level) await c.query("INSERT INTO user_perms (user_id, section, level) VALUES ($1,$2,$3) ON CONFLICT (user_id, section) DO UPDATE SET level = EXCLUDED.level", [userId, section, level]);
    else await c.query("DELETE FROM user_perms WHERE user_id = $1 AND section = $2", [userId, section]);
    return u;
  }
  if (level) await c.query("DELETE FROM user_perms WHERE user_id = $1 AND section LIKE $2", [userId, sec + ":%"]); // a whole section covers every page in it
  // Taking away full-admin rights is refused unless MIN_ADMINS others-or-more would still remain (checked in the same statement as the change).
  if (section === "admin" && cur?.level === "write" && level !== "write") {
    const n = (await c.query(`${level ? "UPDATE user_perms SET level = 'read'" : "DELETE FROM user_perms"} WHERE user_id = $1 AND section = 'admin'
      AND (SELECT count(*) FROM user_perms p JOIN site_users s ON s.id = p.user_id WHERE p.section = 'admin' AND p.level = 'write' AND s.disabled_at IS NULL) > $2`, [userId, MIN_ADMINS])).rowCount;
    if (!n) throw new Error(`At least ${MIN_ADMINS} administrators must remain. Make someone else an administrator first.`);
  } else if (level) await c.query("INSERT INTO user_perms (user_id, section, level) VALUES ($1,$2,$3) ON CONFLICT (user_id, section) DO UPDATE SET level = EXCLUDED.level", [userId, section, level]);
  else await c.query("DELETE FROM user_perms WHERE user_id = $1 AND section = $2", [userId, section]);
  return u;
  });
  if (!u) return null;
  await logAudit(who, "user.access", `${u.email}: ${section} = ${level ?? "none"}`);
  return u.email as string;
}
