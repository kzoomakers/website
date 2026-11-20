import { randomBytes } from "node:crypto";
import { conn } from "@/lib/db";
import { insertNoteOnce } from "./mod-notes";
import { live, tx } from "./submit";
import type { ModResult } from "./mod";

// mod/reparents_controller: an admin takes a user over as their inviter, rarely, to cut a tie to an abusive inviter. Admins only, as Lobsters' require_logged_in_admin.
export const REPARENT_REASON_MAX = 1000;

/** The user's current inviter, for the confirmation page. null when the user doesn't exist. */
export async function reparentTarget(username: string): Promise<{ username: string; inviter: string | null } | null> {
  const r = (await (await conn()).query("SELECT u.username, i.username AS inviter FROM feed.users u LEFT JOIN feed.users i ON i.id = u.invited_by_user_id WHERE lower(u.username) = lower($1)", [username])).rows[0];
  return r ?? null;
}

export const reparentUser = (admin: { id: number }, username: string, reason: string): Promise<ModResult & { username?: string }> => tx(async (c) => {
  reason = reason.trim();
  if (!reason) return { ok: false, error: "Reason can't be blank" };
  if (reason.length > REPARENT_REASON_MAX) return { ok: false, error: `Reason is too long (${REPARENT_REASON_MAX} characters at most)` };
  const a = await live(c, admin.id), me = (await c.query("SELECT username, is_admin FROM feed.users WHERE id = $1", [admin.id])).rows[0];
  if (!a || !me.is_admin || a.banned_at || a.deleted_at) return { ok: false, error: "not permitted" };
  const found = (await c.query("SELECT id, invited_by_user_id FROM feed.users WHERE lower(username) = lower($1)", [username])).rows[0];
  if (!found) return { ok: false, error: "Invalid user" };
  if (Number(found.id) === Number(admin.id)) return { ok: false, error: "You can't reparent yourself" };
  if (!found.invited_by_user_id) return { ok: false, error: "That user has no inviter to be moved from" };
  if (Number(found.invited_by_user_id) === Number(admin.id)) return { ok: false, error: "You already invited that user" };
  // locks in id order, so two admins reparenting around the same people can't deadlock
  const rows = (await c.query("SELECT id, username, invited_by_user_id FROM feed.users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE", [[found.id, found.invited_by_user_id]])).rows;
  const u = rows.find((r) => r.id === found.id), old = rows.find((r) => r.id === found.invited_by_user_id);
  if (!u || !old || Number(u.invited_by_user_id) !== Number(old.id)) return { ok: false, error: "That user's inviter just changed. Try again" };
  // the invite tree must stay a tree: the user can't end up under themselves
  if ((await c.query("WITH RECURSIVE up AS (SELECT id, invited_by_user_id FROM feed.users WHERE id = $1 UNION SELECT x.id, x.invited_by_user_id FROM feed.users x JOIN up ON x.id = up.invited_by_user_id) SELECT 1 FROM up WHERE id = $2", [admin.id, u.id])).rowCount)
    return { ok: false, error: `${me.username} was invited, directly or not, by ${u.username}` };
  await insertNoteOnce(c, admin.id, u.id, `Reparented from [${old.username}](/~${old.username}) to ${me.username} with reason: ${reason}`);
  await insertNoteOnce(c, admin.id, old.id, `Admin reparented their invitee [${u.username}](/~${u.username}) to ${me.username} with reason: ${reason}`);
  await c.query("UPDATE feed.users SET invited_by_user_id = $2 WHERE id = $1", [u.id, admin.id]);
  await c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, action, reason, token) VALUES ($1, $2, $3, $4, $5)", [admin.id, u.id, `Reparented user to be invited by ${me.username}`, reason, `moderation_${randomBytes(16).toString("hex")}`]);
  return { ok: true, username: u.username };
});
