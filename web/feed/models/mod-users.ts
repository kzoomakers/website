import { randomBytes } from "node:crypto";
import { feedMail } from "../mail";
import { SITE_NAME } from "../format";
import { lockCommentStory, recalcComment } from "./comment-cache";
import { live, tx } from "./submit";
import type { ModResult } from "./mod";

// Banning and unbanning users (users_controller#ban/#unban, user.rb ban_by_user_for_reason!, delete!, unban_by_user!). Moderators are admins only here, so "any admin" and "any moderator" are the same people.

const wrap = (s: string, w = 72) => s.replace(new RegExp(`(.{1,${w}})(\\s+|$)`, "g"), "$1\n").trimEnd();
const REASON_MAX = 256; // users.banned_reason

/** Ban a user for a reason: ends their sessions, takes their downvoted comments down, voids their unused invitations, doffs mod-log hats, logs "Banned", and emails them the reason (unless they had already left). */
export async function modBanUser(moderator: { id: number }, username: string, reason: string): Promise<ModResult> {
  reason = reason.trim();
  if (!reason) return { ok: false, error: "You must give a reason for the ban" };
  if (reason.length > REASON_MAX) return { ok: false, error: `Reason is too long (${REASON_MAX} characters at most)` };
  let notify: { email: string | null; username: string; by: string } | null = null;
  const r = await tx<ModResult>(async (c) => {
    const m = await live(c, moderator.id);
    if (!m?.is_moderator || m.banned_at || m.deleted_at) return { ok: false, error: "not permitted" };
    const u = (await c.query("SELECT id, username, email, banned_at, deleted_at, is_moderator FROM feed.users WHERE lower(username) = lower($1) FOR UPDATE", [username])).rows[0];
    if (!u) return { ok: false, error: "Invalid user" };
    if (u.id === moderator.id) return { ok: false, error: "You can't ban yourself" };
    if (u.is_moderator) return { ok: false, error: "Moderators can't be banned" };
    if (u.banned_at) return { ok: true };
    // delete!: comments with a negative score go, their stories' counts follow (stories are locked before comments, as everywhere else)
    for (const cm of (await c.query("SELECT short_id FROM feed.comments WHERE user_id = $1 AND score < 0 AND NOT is_deleted ORDER BY short_id", [u.id])).rows) {
      await lockCommentStory(c, cm.short_id);
      const id = (await c.query("UPDATE feed.comments SET is_deleted = true, updated_at = now() WHERE short_id = $1 RETURNING id", [cm.short_id])).rows[0].id;
      await recalcComment(c, id);
    }
    await c.query("UPDATE feed.invitations SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [u.id]);
    await c.query("UPDATE feed.hats SET doffed_at = now() WHERE user_id = $1 AND modlog_use AND doffed_at IS NULL", [u.id]);
    await c.query("UPDATE feed.users SET banned_at = now(), banned_by_user_id = $2, banned_reason = $3, deleted_at = COALESCE(deleted_at, now()), session_version = session_version + 1 WHERE id = $1", [u.id, moderator.id, reason]);
    await c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, action, reason, token) VALUES ($1, $2, 'Banned', $3, $4)", [moderator.id, u.id, reason, `moderation_${randomBytes(16).toString("hex")}`]);
    if (!u.deleted_at) notify = { email: u.email, username: u.username, by: (await c.query("SELECT username FROM feed.users WHERE id = $1", [moderator.id])).rows[0].username };
    return { ok: true };
  });
  const n = notify as { email: string | null; username: string; by: string } | null;
  if (r.ok && n?.email) await feedMail(n.email, `[${SITE_NAME}] account ${n.username} banned`, `You have been banned from ${SITE_NAME} by ${n.by} for:\n\n  ${wrap(reason).replace(/\n/g, "\n  ")}\n\nYou are no longer allowed to log in to the site. If you wish, you can discuss this ban with the moderator by replying to this email.\n`);
  return r;
}

/** Lift a ban (and the deactivation that came with it). The reason is optional here, as in Lobsters. */
export const modUnbanUser = (moderator: { id: number }, username: string, reason = ""): Promise<ModResult> => tx(async (c) => {
  const m = await live(c, moderator.id);
  if (!m?.is_moderator || m.banned_at || m.deleted_at) return { ok: false, error: "not permitted" };
  const u = (await c.query("SELECT id, banned_at FROM feed.users WHERE lower(username) = lower($1) FOR UPDATE", [username])).rows[0];
  if (!u) return { ok: false, error: "Invalid user" };
  if (!u.banned_at) return { ok: true };
  await c.query("UPDATE feed.users SET banned_at = NULL, banned_by_user_id = NULL, banned_reason = NULL, deleted_at = NULL WHERE id = $1", [u.id]);
  await c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, action, reason, token) VALUES ($1, $2, 'Unbanned', $3, $4)", [moderator.id, u.id, reason.trim().slice(0, 4000) || null, `moderation_${randomBytes(16).toString("hex")}`]);
  return { ok: true };
});

/** user.rb disable_invite_by_user_for_reason! and enable_invite_by_user!: takes away or gives back the right to send invitations. Disabling needs a reason, logs it, and tells the user in a mod mail thread (Lobsters sends a private message). */
export async function modSetInvites(moderator: { id: number }, username: string, disable: boolean, reason = ""): Promise<ModResult> {
  reason = reason.trim();
  if (disable && !reason) return { ok: false, error: "You must give a reason" };
  if (reason.length > 200) return { ok: false, error: "Reason is too long (200 characters at most)" };
  let target = "";
  const r = await tx<ModResult>(async (c) => {
    const m = await live(c, moderator.id);
    if (!m?.is_moderator || m.banned_at || m.deleted_at) return { ok: false, error: "not permitted" };
    const u = (await c.query("SELECT id, username, disabled_invite_at FROM feed.users WHERE lower(username) = lower($1) FOR UPDATE", [username])).rows[0];
    if (!u) return { ok: false, error: "Invalid user" };
    if (!!u.disabled_invite_at === disable) return { ok: true };
    if (disable) await c.query("UPDATE feed.users SET disabled_invite_at = now(), disabled_invite_by_user_id = $2, disabled_invite_reason = $3 WHERE id = $1", [u.id, moderator.id, reason]);
    else await c.query("UPDATE feed.users SET disabled_invite_at = NULL, disabled_invite_by_user_id = NULL, disabled_invite_reason = NULL WHERE id = $1", [u.id]);
    await c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, action, reason, token) VALUES ($1, $2, $3, $4, $5)", [moderator.id, u.id, disable ? "Disabled invitations and suggestions" : "Enabled invitations", reason || null, `moderation_${randomBytes(16).toString("hex")}`]);
    if (disable) target = u.username;
    return { ok: true };
  });
  if (r.ok && target) { // best effort: the privilege is already gone, a failed notice must not undo it
    const { createModMail, sendModMailMessage } = await import("./mod-mail");
    const mail = await createModMail(moderator, { subject: "Your invite and suggestion privileges have been revoked", recipients: target, commentRefs: "", storyRefs: "" }).catch(() => null);
    if (mail?.ok) await sendModMailMessage(moderator, mail.shortId, `The reason given:\n\n> *${reason}*\n\nYou can reply here if you would like to discuss it.`).catch(() => null);
  }
  return r;
}
