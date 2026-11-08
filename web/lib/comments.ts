import { notifyUser } from "./notifications";
import { createHash } from "crypto";
import { db } from "./db";
import { getMailCfg, mailReady, sendQueued as send } from "./mail";
import { judge, type Mode } from "./spam";
import type { Item } from "./comment-tree";

export type Status = "approved" | "pending" | "spam" | "hidden";
export type AdminComment = { id: number; post_id: number; parent_id: number | null; body: string; status: Status; reason: string; created_at: string; name: string; email: string; post_title: string; post_slug: string; parent_name: string | null };
export type Settings = { mode: Mode; closeAfterDays: number; notify: boolean; blocked: string };
const DEFAULTS: Settings = { mode: "first_time", closeAfterDays: 0, notify: true, blocked: "" };
export const MAX_LEN = 2000;

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULTS, ...(await (await conn()).query("SELECT data FROM settings WHERE key = 'blog:comments'")).rows[0]?.data };
}
export async function saveSettings(x: Partial<Settings>): Promise<Settings> {
  const s = { ...(await getSettings()), ...x };
  if (!["none", "first_time", "all"].includes(s.mode)) throw new Error("bad mode");
  s.closeAfterDays = Math.max(0, Math.min(3650, Math.floor(Number(s.closeAfterDays)) || 0));
  s.blocked = String(s.blocked).slice(0, 5000);
  await (await conn()).query("INSERT INTO settings (key, data) VALUES ('blog:comments', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(s)]);
  return s;
}

/** The visitor's address as our own proxy saw it. The FIRST X-Forwarded-For entry is whatever the visitor typed, so it is never used. */
// Only headers our own proxy sets can be believed: Fly's on Fly, otherwise the last X-Forwarded-For entry (the one the single proxy in front of us appended).
// shortcut: assumes exactly one trusted proxy; with none, or more than one, limits are per-"unknown" or per-proxy. Put the app behind one.
export const clientIp = (req: Request) =>
  ((process.env.FLY_APP_NAME && req.headers.get("fly-client-ip")) || req.headers.get("x-forwarded-for")?.split(",").at(-1) || "unknown").trim();
/** Hashed so we can rate-limit per address without storing it. */
export const hashIp = (req: Request) => createHash("sha256").update((process.env.AUTH_SECRET ?? "") + "|ip|" + clientIp(req)).digest("hex").slice(0, 24);

/**
 * A post's thread as a flat list (the client builds the tree). Readers see approved comments plus their own pending ones.
 * A comment that is hidden/spam but has visible replies stays as a "removed" placeholder so the thread keeps its shape; bodies never leave the server.
 */
export async function listThread(postId: number, viewer: number | null): Promise<Item[]> {
  if (!db()) return [];
  const rows = (await (await conn()).query(`
    SELECT c.id, c.parent_id, c.body, c.status, c.created_at, c.user_id, u.name,
      (SELECT count(*)::int FROM comment_likes l WHERE l.comment_id = c.id) AS likes,
      EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $2) AS liked,
      COALESCE(u.email <> '' AND lower(u.email) = lower((SELECT a.email FROM authors a WHERE a.id = p.author_id)), false) AS staff
    FROM comments c JOIN site_users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id
    WHERE c.post_id = $1 ORDER BY c.id`, [postId, viewer])).rows;
  const shown = (r: any) => r.status === "approved" || (r.status === "pending" && r.user_id === viewer);
  const keep = new Set<number>(), parent = new Map<number, number | null>(rows.map((r) => [r.id, r.parent_id]));
  // Parents always have smaller ids, so walking newest-first lets visibility bubble up to ancestors.
  for (const r of [...rows].reverse()) if (shown(r) || keep.has(r.id)) { keep.add(r.id); if (parent.get(r.id) != null) keep.add(parent.get(r.id)!); }
  return rows.filter((r) => keep.has(r.id)).map((r) => {
    const ok = shown(r);
    return { id: r.id, parent: r.parent_id, name: ok ? r.name : "", body: ok ? r.body : "", at: new Date(r.created_at).toISOString(), likes: ok ? r.likes : 0, liked: r.liked, mine: r.user_id === viewer, pending: r.status === "pending", removed: !ok, staff: ok && r.staff };
  });
}

export async function addComment(o: { postId: number; userId: number; body: string; parentId?: number | null; ipHash: string; base: string }): Promise<Item> {
  const text = o.body.trim();
  if (!text || text.length > MAX_LEN) throw new Error(`Comments must be 1 to ${MAX_LEN} characters.`);
  const c = await conn(), s = await getSettings();
  const post = (await c.query("SELECT id, COALESCE(publish_at, updated_at) AS at FROM posts WHERE id = $1 AND status = 'published' AND (publish_at IS NULL OR publish_at <= now())", [o.postId])).rows[0];
  if (!post) throw new Error("No such post.");
  if (s.closeAfterDays && Date.now() - new Date(post.at).getTime() > s.closeAfterDays * 864e5) throw new Error("Comments are closed on this post.");
  if (o.parentId && !(await c.query("SELECT 1 FROM comments WHERE id = $1 AND post_id = $2 AND status = 'approved'", [o.parentId, o.postId])).rowCount) throw new Error("That comment is no longer available to reply to.");
  if ((await c.query("SELECT 1 FROM comments WHERE user_id = $1 AND created_at > now() - interval '10 seconds'", [o.userId])).rowCount) throw new Error("Slow down a little: try again in a few seconds.");
  // shortcut: per-IP limit trusts x-forwarded-for from the host's proxy; with no header all visitors share one bucket (hence the higher cap).
  if ((await c.query("SELECT count(*)::int AS n FROM comments WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'", [o.ipHash])).rows[0].n >= (o.ipHash ? 5 : 20)) throw new Error("Too many comments from your network. Please try again in a few minutes.");
  const [prior, dupe] = await Promise.all([
    c.query("SELECT count(*)::int AS n FROM comments WHERE user_id = $1 AND status = 'approved'", [o.userId]),
    c.query("SELECT 1 FROM comments WHERE user_id = $1 AND body = $2 AND created_at > now() - interval '1 day'", [o.userId, text])]);
  const v = judge(text, { mode: s.mode, blocked: s.blocked.toLowerCase().split(/[\n,]+/).map((w) => w.trim()).filter(Boolean), priorApproved: prior.rows[0].n, duplicate: !!dupe.rowCount });
  const r = (await c.query("INSERT INTO comments (post_id, user_id, parent_id, body, status, reason, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at", [o.postId, o.userId, o.parentId || null, text, v.status, v.reason, o.ipHash])).rows[0];
  if (v.status === "approved") notify(r.id, o.base).catch(() => {});
  const name = (await c.query("SELECT name FROM site_users WHERE id = $1", [o.userId])).rows[0].name;
  // Spam is reported back as "pending" so a bot can't tell it was caught.
  return { id: r.id, parent: o.parentId || null, name, body: text, at: new Date(r.created_at).toISOString(), likes: 0, liked: false, mine: true, pending: v.status !== "approved", removed: false, staff: false };
}

export async function toggleLike(commentId: number, userId: number) {
  const c = await conn();
  if (!(await c.query("SELECT 1 FROM comments WHERE id = $1 AND status = 'approved'", [commentId])).rowCount) throw new Error("No such comment.");
  const gone = await c.query("DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2", [commentId, userId]);
  if (!gone.rowCount) await c.query("INSERT INTO comment_likes VALUES ($1, $2) ON CONFLICT DO NOTHING", [commentId, userId]);
  return { liked: !gone.rowCount, likes: (await c.query("SELECT count(*)::int AS n FROM comment_likes WHERE comment_id = $1", [commentId])).rows[0].n as number };
}

/** Emails the post's author and, for a reply, the person replied to. Skips the commenter themself and anyone already emailed. */
async function notify(id: number, base: string) {
  // In-app: tell the author of the comment being replied to (not for replying to yourself).
  const n = (await (await conn()).query(`SELECT c.body, c.user_id, u.name, p.title, p.slug, pc.user_id AS parent_user FROM comments c JOIN site_users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id
    LEFT JOIN comments pc ON pc.id = c.parent_id WHERE c.id = $1`, [id])).rows[0];
  if (n?.parent_user && n.parent_user !== n.user_id)
    await notifyUser(n.parent_user, { kind: "comment.reply", title: `${n.name} replied to your comment on "${n.title}"`, body: n.body, url: `/blog/${n.slug}#c${id}` }).catch(() => {});
  const [cfg, s] = [await getMailCfg(), await getSettings()];
  if (!s.notify || !mailReady(cfg)) return;
  const r = (await (await conn()).query(`SELECT c.body, u.name, u.email AS by, p.title, p.slug, (SELECT a.email FROM authors a WHERE a.id = p.author_id) AS author_email, pu.email AS parent_email
    FROM comments c JOIN site_users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id
    LEFT JOIN comments pc ON pc.id = c.parent_id LEFT JOIN site_users pu ON pu.id = pc.user_id WHERE c.id = $1`, [id])).rows[0];
  if (!r) return;
  const seen = new Set([r.by.toLowerCase()]), link = `${base}/blog/${r.slug}#c${id}`, esc = (t: string) => t.replace(/[<>&"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[m]!));
  const excerpt = r.body.length > 500 ? r.body.slice(0, 500) + "…" : r.body;
  for (const [to, why] of [[r.parent_email, "replied to your comment on"], [r.author_email, "commented on"]] as const) {
    if (!to || seen.has(to.toLowerCase())) continue;
    seen.add(to.toLowerCase());
    await send({ to, subject: `${r.name.replace(/[\r\n]/g, " ")} ${why} "${r.title.replace(/[\r\n]/g, " ")}"`,
      text: `${r.name} ${why} "${r.title}":\n\n${excerpt}\n\n${link}`,
      html: `<p><strong>${esc(r.name)}</strong> ${why} &ldquo;${esc(r.title)}&rdquo;:</p><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555">${esc(excerpt)}</blockquote><p><a href="${link}">View the conversation</a></p>` }, cfg);
  }
}

// ---- moderation (admin)
export async function allComments(status?: string): Promise<AdminComment[]> {
  if (!db()) return [];
  return (await (await conn()).query(`SELECT c.id, c.post_id, c.parent_id, c.body, c.status, c.reason, c.created_at, u.name, u.email, p.title AS post_title, p.slug AS post_slug, pu.name AS parent_name
    FROM comments c JOIN site_users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id LEFT JOIN comments pc ON pc.id = c.parent_id LEFT JOIN site_users pu ON pu.id = pc.user_id
    ${status ? "WHERE c.status = $1" : ""} ORDER BY c.id DESC LIMIT 300`, status ? [status] : [])).rows;
}
export async function counts(): Promise<Record<string, number>> {
  if (!db()) return {};
  return Object.fromEntries((await (await conn()).query("SELECT status, count(*)::int AS n FROM comments GROUP BY status")).rows.map((r) => [r.status, r.n]));
}
export async function setStatus(id: number, status: Status, base: string) {
  if (!["approved", "pending", "spam", "hidden"].includes(status)) throw new Error("bad status");
  const r = await (await conn()).query("UPDATE comments SET status = $2 WHERE id = $1 AND status <> $2 RETURNING id", [id, status]);
  if (r.rowCount && status === "approved") notify(id, base).catch(() => {});
}
/** Deleting removes the comment and (by cascade) every reply under it. */
export const deleteComment = async (id: number) => void (await (await conn()).query("DELETE FROM comments WHERE id = $1", [id]));
export const emptySpam = async () => (await (await conn()).query("DELETE FROM comments WHERE status = 'spam'")).rowCount ?? 0;
