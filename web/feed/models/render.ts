import type { PoolClient } from "pg";
import { mentionedUsers, renderMarkdown } from "../markdown";

/** Markdown for a post, linking @mentions of users that exist (one lookup). Images only when `allowImages`. */
export async function renderPost(c: PoolClient, text: string, allowImages = false) {
  const users = new Set<string>(), names = mentionedUsers(text);
  if (names.length) for (const r of (await c.query("SELECT lower(username) n FROM feed.users WHERE lower(username) = ANY($1::text[]) AND deleted_at IS NULL UNION SELECT lower(username) FROM feed.usernames WHERE lower(username) = ANY($1::text[]) AND renamed_away_at IS NULL", [names])).rows) users.add(r.n);
  return renderMarkdown(text, { users, allowImages });
}
