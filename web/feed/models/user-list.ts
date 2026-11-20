import { conn } from "@/lib/db";

export type ListedUser = { id: number; username: string; created_at: Date | null; invited_by_user_id: number | null; is_admin: boolean; is_moderator: boolean; karma: number; banned_at: Date | null; deleted_at: Date | null };
const COLS = "id, username, created_at, invited_by_user_id, is_admin, is_moderator, karma, banned_at, deleted_at";
// People who have picked a username, and not the account that automatic notes are written as.
const SHOWN = "username IS NOT NULL AND lower(username) <> 'inactive-user'";

/** users#tree (by invitation), by karma, and the moderators and administrators. Everyone is loaded at once, as Lobsters does: this is a small community. */
export async function listUsers(which: "tree" | "karma" | "moderators"): Promise<ListedUser[]> {
  const where = which === "moderators" ? `${SHOWN} AND (is_admin OR is_moderator)` : SHOWN;
  const order = which === "karma" ? "karma DESC, id" : which === "moderators" ? "id" : "id DESC";
  return (await (await conn()).query(`SELECT ${COLS} FROM feed.users WHERE ${where} ORDER BY ${order} LIMIT 20000`)).rows;
}
