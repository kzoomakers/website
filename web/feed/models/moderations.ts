import { conn } from "@/lib/db";

export const MODERATIONS_PER_PAGE = 50;
export const WHAT = ["stories", "comments", "tags", "users", "domains", "origins", "categories"] as const;
export type What = (typeof WHAT)[number];
const COL: Record<What, string> = { stories: "story_id", comments: "comment_id", tags: "tag_id", users: "user_id", domains: "domain_id", origins: "origin_id", categories: "category_id" };
export type ModRow = {
  id: number; created_at: Date; action: string; reason: string | null; is_from_suggestions: boolean; moderator: string | null;
  story_short_id: string | null; story_title: string | null; comment_short_id: string | null; comment_user: string | null; comment_story_short_id: string | null; comment_story_title: string | null;
  tag: string | null; category: string | null; user_id: number | null; user: string | null; domain: string | null; origin: string | null;
};

const FROM = `FROM feed.moderations m LEFT JOIN feed.users mu ON mu.id = m.moderator_user_id LEFT JOIN feed.stories s ON s.id = m.story_id LEFT JOIN feed.comments cm ON cm.id = m.comment_id LEFT JOIN feed.users cu ON cu.id = cm.user_id LEFT JOIN feed.stories cs ON cs.id = cm.story_id
  LEFT JOIN feed.tags t ON t.id = m.tag_id LEFT JOIN feed.categories cat ON cat.id = m.category_id LEFT JOIN feed.users u ON u.id = m.user_id LEFT JOIN feed.domains d ON d.id = m.domain_id LEFT JOIN feed.origins o ON o.id = m.origin_id`;
const SEL = `SELECT m.id, m.created_at, m.action, m.reason, m.is_from_suggestions, mu.username AS moderator, s.short_id AS story_short_id, s.title AS story_title,
  cm.short_id AS comment_short_id, cu.username AS comment_user, cs.short_id AS comment_story_short_id, cs.title AS comment_story_title, t.tag, cat.category, m.user_id, u.username AS "user", d.domain, o.identifier AS origin`;

/** The /mod activity feed's moderation rows: everything logged since `since`, newest first. shortcut: capped at 500, raise it if a busy quarter gets cut off. */
export async function moderationsSince(since: Date): Promise<ModRow[]> {
  return (await (await conn()).query(`${SEL} ${FROM} WHERE m.created_at >= $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 500`, [since])).rows;
}

/** moderations_controller#index. `moderator` is "(All)", "(Moderators)", "(Users)" or a username; `what` is the set of kinds to show (empty means all). */
export async function listModerations(moderator: string, what: What[], page: number): Promise<{ rows: ModRow[]; pages: number }> {
  const c = await conn(), params: unknown[] = [];
  const p = (v: unknown) => `$${params.push(v)}`;
  const cond: string[] = [];
  if (moderator === "(Moderators)") cond.push("m.moderator_user_id IS NOT NULL");
  else if (moderator === "(Users)") cond.push("m.is_from_suggestions");
  else if (moderator !== "(All)") cond.push(`lower(mu.username) = lower(${p(moderator)})`);
  if (what.length) cond.push(`(${what.map((w) => `m.${COL[w]} IS NOT NULL`).join(" OR ")})`); // COL values are fixed names, never request text
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const total = (await c.query(`SELECT count(*)::int n FROM feed.moderations m LEFT JOIN feed.users mu ON mu.id = m.moderator_user_id ${where}`, params)).rows[0].n as number;
  const rows = (await c.query(`${SEL} ${FROM} ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT ${p(MODERATIONS_PER_PAGE)} OFFSET ${p((page - 1) * MODERATIONS_PER_PAGE)}`, params)).rows;
  return { rows, pages: Math.ceil(total / MODERATIONS_PER_PAGE) };
}

export const moderatorNames = async (): Promise<string[]> => (await (await conn()).query("SELECT username FROM feed.users WHERE is_moderator ORDER BY username")).rows.map((r) => r.username);
