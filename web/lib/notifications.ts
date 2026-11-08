import { db } from "./db";

export type Note = { id: number; kind: string; title: string; body: string; url: string; at: string; read: boolean };

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

/** Drops a notification in someone's inbox. Any feature can call this; `kind` is just a label (e.g. "comment.reply"). */
export async function notifyUser(userId: number, n: { kind: string; title: string; body?: string; url?: string }) {
  await (await conn()).query("INSERT INTO notifications (user_id, kind, title, body, url) VALUES ($1,$2,$3,$4,$5)", [userId, n.kind, n.title.slice(0, 200), (n.body ?? "").slice(0, 500), n.url ?? ""]);
}

export async function listNotes(userId: number, limit = 50) {
  const c = await conn();
  const [rows, unread] = await Promise.all([
    c.query("SELECT id, kind, title, body, url, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2", [userId, limit]),
    c.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId])]);
  return { unread: unread.rows[0].n as number, notes: rows.rows.map((r): Note => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url, at: new Date(r.created_at).toISOString(), read: !!r.read_at })) };
}

/** Marks the given notifications (or all of them) read; only ever touches this user's own rows. */
export async function markRead(userId: number, ids?: number[]) {
  await (await conn()).query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND ($2::int[] IS NULL OR id = ANY($2))", [userId, ids ?? null]);
}
