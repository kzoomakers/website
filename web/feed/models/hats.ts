import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { live, tx } from "./submit";
import { renderPost } from "./render";

// Hats (hat.rb, hat_request.rb, hats_controller, hat_requests_controller). A hat is a verified way of speaking for a project or company; a comment or message can wear one of its author's active hats.
export const HAT_MAX = 255, COMMENT_MAX = 65_535;
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const bad = (error: string) => ({ ok: false as const, error });
const tok = (p: string) => `${p}_${randomBytes(16).toString("hex")}`;
const SHORT = "abcdefghijklmnopqrstuvwxyz0123456789";
const shortId = () => Array.from(randomBytes(6), (b) => SHORT[b % 36]).join("");
const modOf = async (c: PoolClient, id: number) => { const u = await live(c, id); return u?.is_moderator && !u.banned_at && !u.deleted_at ? u : null; };
const logMod = (c: PoolClient, mod: number | null, user: number, action: string, reason: string | null = null) =>
  c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, action, reason, token) VALUES ($1, $2, $3, $4, $5)", [mod, user, action, reason, tok("moderation")]);

export type WearableHat = { short_id: string; hat: string; modlog_use: boolean };
/** The hats a user can put on (not doffed), for the pickers. */
export async function wearableHats(userId: number): Promise<WearableHat[]> {
  return (await (await conn()).query("SELECT short_id, hat, modlog_use FROM feed.hats WHERE user_id = $1 AND doffed_at IS NULL ORDER BY hat, id", [userId])).rows;
}
/** The id of one of the user's wearable hats by short id, or null: a picked hat they can't wear is ignored, as `wearable_hats.find_by` does. */
export async function hatId(c: PoolClient, userId: number, sid: string | undefined | null): Promise<number | null> {
  if (!sid) return null;
  const r = (await c.query("SELECT id FROM feed.hats WHERE user_id = $1 AND short_id = $2 AND doffed_at IS NULL", [userId, sid])).rows[0];
  return r ? Number(r.id) : null;
}

export type HatRow = { short_id: string; hat: string; link: string | null; username: string; doffed_at: Date | null };
/** hats#index: active hats of active users, by hat then username. */
export async function activeHats(): Promise<HatRow[]> {
  return (await (await conn()).query(
    `SELECT h.short_id, h.hat, h.link, u.username, h.doffed_at FROM feed.hats h JOIN feed.users u ON u.id = h.user_id
     WHERE h.doffed_at IS NULL AND u.banned_at IS NULL AND u.deleted_at IS NULL ORDER BY lower(h.hat), lower(u.username)`)).rows;
}

export const requestHat = async (userId: number, i: { hat: string; link: string; comment: string }): Promise<Result> => {
  const hat = i.hat.trim(), link = i.link.trim(), comment = i.comment.trim();
  if (!hat || hat.length > HAT_MAX) return bad(`Hat must be 1 to ${HAT_MAX} characters`);
  if (!link || link.length > HAT_MAX) return bad(`Link must be 1 to ${HAT_MAX} characters`);
  if (!comment || comment.length > COMMENT_MAX) return bad("Comment can't be blank");
  return tx(async (c) => {
    const u = await live(c, userId);
    if (!u || u.banned_at || u.deleted_at) return bad("not permitted");
    await c.query("INSERT INTO feed.hat_requests (user_id, hat, link, comment, token, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, now(), now())", [userId, hat, link, comment, tok("hat_request")]);
    return { ok: true };
  });
};

export type RequestRow = { id: number; username: string; hat: string; link: string; comment_html: string; created_at: Date };
export async function listRequests(): Promise<RequestRow[]> {
  const db = await conn();
  const rows = (await db.query("SELECT r.id, u.username, r.hat, r.link, r.comment, r.created_at FROM feed.hat_requests r JOIN feed.users u ON u.id = r.user_id ORDER BY r.id")).rows;
  return Promise.all(rows.map(async (r) => ({ id: Number(r.id), username: r.username, hat: r.hat, link: r.link, created_at: r.created_at, comment_html: await renderPost(db as unknown as PoolClient, r.comment) })));
}

/** A moderator's message to the requester, as Message.new in hat_request.rb (author is the moderator). */
const notify = async (c: PoolClient, mod: number, to: number, subject: string, body: string) => {
  let m;
  do m = (await c.query("INSERT INTO feed.messages (author_user_id, recipient_user_id, subject, body, short_id, token, created_at) VALUES ($1, $2, $3, $4, $5, $6, now()) ON CONFLICT (short_id) DO NOTHING RETURNING id", [mod, to, subject, body, shortId(), tok("message")])).rows[0];
  while (!m);
  await c.query("INSERT INTO feed.notifications (user_id, notifiable_type, notifiable_id, token) VALUES ($1, 'Message', $2, $3)", [to, m.id, tok("notification")]);
};

/** approve (with the moderator's edits to hat and link) or reject: either way the requester is told by message and the request is removed. */
export const decideRequest = (modId: number, id: number, approve: boolean, i: { hat: string; link: string; reason: string }): Promise<Result> => tx(async (c) => {
  if (!(await modOf(c, modId))) return bad("not permitted");
  const reason = i.reason.trim(), hat = i.hat.trim(), link = i.link.trim();
  if (!reason) return bad("Reason can't be blank");
  const r = (await c.query("SELECT user_id, hat, link FROM feed.hat_requests WHERE id = $1 FOR UPDATE", [id])).rows[0];
  if (!r) return bad("That request was already handled");
  const to = Number(r.user_id);
  if (approve) {
    if (!hat || hat.length > HAT_MAX || link.length > HAT_MAX) return bad(`Hat must be 1 to ${HAT_MAX} characters`);
    let h;
    do h = (await c.query("INSERT INTO feed.hats (user_id, granted_by_user_id, hat, link, short_id, token, created_at, updated_at) SELECT $1::bigint, $2::bigint, $3::text, $4::text, $5::text, $6::text, now(), now() WHERE NOT EXISTS (SELECT 1 FROM feed.hats WHERE short_id = $5::text) RETURNING id", [to, modId, hat, link || null, shortId(), tok("hat")])).rows[0];
    while (!h);
    await logMod(c, modId, to, `Granted hat "${hat}"${link ? ` (${link})` : ""}`);
    await notify(c, modId, to, `Your hat "${hat}" has been approved`, reason + " ".repeat(20));
  } else await notify(c, modId, to, `Your request for hat "${r.hat}" has been rejected`, reason);
  await c.query("DELETE FROM feed.hat_requests WHERE id = $1", [id]);
  return { ok: true };
});

export type HatEdit = { short_id: string; hat: string; link: string; username: string };
/** The hat a person may doff or edit: their own, or any if they moderate. */
export async function hatFor(userId: number, isModerator: boolean, sid: string): Promise<HatEdit | null> {
  return (await (await conn()).query(
    `SELECT h.short_id, h.hat, COALESCE(h.link, '') AS link, u.username FROM feed.hats h JOIN feed.users u ON u.id = h.user_id
     WHERE h.short_id = $1 AND h.doffed_at IS NULL AND ($3 OR h.user_id = $2)`, [sid, userId, isModerator])).rows[0] ?? null;
}

const doff = async (c: PoolClient, h: { id: number; user_id: number; hat: string }, by: { id: number; is_moderator: boolean }, reason: string) => {
  await logMod(c, by.is_moderator ? by.id : null, Number(h.user_id), `Doffed hat "${h.hat}"`, reason);
  await c.query("UPDATE feed.hats SET doffed_at = now(), updated_at = now() WHERE id = $1", [h.id]);
};
const findHat = async (c: PoolClient, by: { id: number; is_moderator: boolean }, sid: string) =>
  (await c.query("SELECT id, user_id, hat, link, granted_by_user_id, modlog_use FROM feed.hats WHERE short_id = $1 AND doffed_at IS NULL AND ($3 OR user_id = $2) FOR UPDATE", [sid, by.id, by.is_moderator])).rows[0];

/** hats#doff_by_user: the wearer or a moderator, with a public reason. Returns the wearer's username. */
export const doffHat = (userId: number, sid: string, reason: string): Promise<Result<{ username: string }>> => tx(async (c) => {
  const u = await live(c, userId);
  if (!u || u.banned_at || u.deleted_at) return bad("not permitted");
  reason = reason.trim();
  if (!reason) return bad("You must give a reason for the doffing.");
  const by = { id: userId, is_moderator: !!u.is_moderator }, h = await findHat(c, by, sid);
  if (!h) return bad("Can't find that hat");
  await doff(c, h, by, reason.slice(0, 1000));
  return { ok: true, username: (await c.query("SELECT username FROM feed.users WHERE id = $1", [h.user_id])).rows[0].username };
});

/** hats#update_in_place (rename and relink) and #update_by_recreating (doff the old, grant a new hat of the new name). Moderators only. */
export const editHat = (modId: number, sid: string, i: { hat: string; link: string }, recreate: boolean): Promise<Result> => tx(async (c) => {
  const m = await modOf(c, modId);
  if (!m) return bad("not permitted");
  const name = i.hat.trim(), link = i.link.trim();
  if (!name || name.length > HAT_MAX || link.length > HAT_MAX) return bad(`Hat must be 1 to ${HAT_MAX} characters`);
  const h = await findHat(c, { id: modId, is_moderator: true }, sid);
  if (!h) return bad("Can't find that hat");
  if (recreate) {
    let n;
    do n = (await c.query("INSERT INTO feed.hats (user_id, granted_by_user_id, hat, link, modlog_use, short_id, token, created_at, updated_at) SELECT $1::bigint, $2::bigint, $3::text, $4::text, $5::boolean, $6::text, $7::text, now(), now() WHERE NOT EXISTS (SELECT 1 FROM feed.hats WHERE short_id = $6::text) RETURNING id", [h.user_id, h.granted_by_user_id, name, h.link, h.modlog_use, shortId(), tok("hat")])).rows[0];
    while (!n);
    await logMod(c, modId, Number(h.user_id), `Granted hat "${name}"${h.link ? ` (${h.link})` : ""}`);
    await doff(c, h, { id: modId, is_moderator: true }, `To replace with "${name}"`);
    return { ok: true };
  }
  const was = [name !== h.hat && `renamed hat "${h.hat}" to "${name}"`, link !== (h.link ?? "") && `changed link from "${h.link ?? ""}" to "${link}"`].filter(Boolean).join(", ");
  await c.query("UPDATE feed.hats SET hat = $2, link = $3, updated_at = now() WHERE id = $1", [h.id, name, link || null]);
  if (was) await logMod(c, modId, Number(h.user_id), was);
  return { ok: true };
});
