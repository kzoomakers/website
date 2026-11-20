import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { live, tx } from "./submit";
import { renderPost } from "./render";

// Mod notes (mod_note.rb, mod/notes_controller): private notes moderators leave on a user, plus the automatic "tattle" notes the site writes about a user's attempts. Only moderators ever see them.

export const NOTE_MAX = 65_535;
export type NoteResult = { ok: true } | { ok: false; error: string };
export type NoteRow = { id: number; moderator: string | null; created_at: Date; markeddown_note: string };
const tok = () => `mod_note_${randomBytes(16).toString("hex")}`;

export const insertNote = async (c: PoolClient, moderatorId: number, userId: number, note: string) =>
  void (await c.query("INSERT INTO feed.mod_notes (moderator_user_id, user_id, note, markeddown_note, token) VALUES ($1, $2, $3, $4, $5)", [moderatorId, userId, note, await renderPost(c, note), tok()]));

/** mod_note.rb create_without_dupe!: not written when it repeats the user's latest note by the same moderator (a double click). */
export async function insertNoteOnce(c: PoolClient, moderatorId: number, userId: number, note: string) {
  const last = (await c.query("SELECT moderator_user_id, note FROM feed.mod_notes WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [userId])).rows[0];
  if (!(last && Number(last.moderator_user_id) === moderatorId && last.note === note)) await insertNote(c, moderatorId, userId, note);
}

/** A moderator's note on a user. */
export const addModNote = (moderator: { id: number }, username: string, note: string): Promise<NoteResult> => tx(async (c) => {
  const m = await live(c, moderator.id);
  if (!m?.is_moderator || m.banned_at || m.deleted_at) return { ok: false, error: "not permitted" };
  note = note.replace(/\r\n/g, "\n").trim();
  if (!note) return { ok: false, error: "Note can't be blank" };
  if (note.length > NOTE_MAX) return { ok: false, error: "Note is too long" };
  const u = (await c.query("SELECT id FROM feed.users WHERE lower(username) = lower($1)", [username])).rows[0];
  if (!u) return { ok: false, error: "Not a valid user" };
  await insertNote(c, moderator.id, u.id, note);
  return { ok: true };
});

/** The account automatic notes are written as (InactiveUser.inactive_user). Created on first use, and deactivated so nobody can sign in as it. */
async function systemUser(c: PoolClient): Promise<number> {
  await c.query("INSERT INTO feed.users (username, token, kind, deleted_at, created_at) VALUES ('inactive-user', $1, 'external', now(), now()) ON CONFLICT (lower(username)) DO NOTHING", [`user_${randomBytes(16).toString("hex")}`]);
  return Number((await c.query("SELECT id FROM feed.users WHERE lower(username) = 'inactive-user'")).rows[0].id);
}

/** mod_note.rb tattle_on_*: an automatic note about a user, skipped when it repeats the user's latest note. Never throws and never joins the caller's transaction: it is called from paths that roll back (a refused story or comment), and a failed note must not break them. */
export async function tattle(userId: number, note: string): Promise<void> {
  try {
    const c = await (await conn()).connect();
    try {
      const sys = await systemUser(c);
      const last = (await c.query("SELECT moderator_user_id, note FROM feed.mod_notes WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [userId])).rows[0];
      if (last && Number(last.moderator_user_id) === sys && last.note === note) return;
      await c.query("INSERT INTO feed.mod_notes (moderator_user_id, user_id, note, markeddown_note, token) VALUES ($1, $2, $3, $4, $5)", [sys, userId, note, await renderPost(c, note), tok()]);
    } finally { c.release(); }
  } catch (e) { console.error("feed tattle:", e); }
}

/** A user's notes for the moderator reading their profile, newest first. Automatic notes have no moderator name. */
export async function notesFor(userId: number, limit = 50): Promise<NoteRow[]> {
  return (await (await conn()).query(
    `SELECT n.id, CASE WHEN m.username = 'inactive-user' THEN NULL ELSE m.username END AS moderator, n.created_at, n.markeddown_note
     FROM feed.mod_notes n JOIN feed.users m ON m.id = n.moderator_user_id WHERE n.user_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT $2`, [userId, limit])).rows;
}
