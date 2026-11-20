import { randomBytes } from "node:crypto";
import { live, tx } from "./submit";
import { recalcStory } from "./vote";

// Hide and save (hidden_story.rb, saved_story.rb and the matching stories_controller actions). Read ribbons (reply notifications per story) arrive with notifications.

export type MarkResult = { ok: true } | { ok: false; error: string };
type Action = "hide" | "unhide" | "save" | "unsave";
const tok = (k: string) => `${k}_${randomBytes(16).toString("hex")}`;

export const markStory = (user: { id: number }, shortId: string, action: Action): Promise<MarkResult> => tx(async (c) => {
  const u = await live(c, user.id);
  if (!u || u.banned_at || u.deleted_at) return { ok: false, error: "not permitted" };
  const s = (await c.query("SELECT id, merged_story_id FROM feed.stories WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  if (!s) return { ok: false, error: "Can't find story" };
  if (s.merged_story_id && (action === "hide" || action === "save")) return { ok: false, error: "Story has been merged" };
  const table = action.endsWith("hide") ? "hidden_stories" : "saved_stories";
  if (action === "hide" || action === "save") {
    await c.query(`INSERT INTO feed.${table} (user_id, story_id, created_at, token) VALUES ($1, $2, now(), $3) ON CONFLICT (user_id, story_id) DO NOTHING`, [user.id, s.id, tok(table)]);
  } else {
    await c.query(`DELETE FROM feed.${table} WHERE user_id = $1 AND story_id = $2`, [user.id, s.id]);
    // unhiding a story you flagged takes the flag back
    if (action === "unhide") { await c.query("DELETE FROM feed.votes WHERE user_id = $1 AND story_id = $2 AND comment_id IS NULL AND vote = -1", [user.id, s.id]); await recalcStory(c, s.id); }
  }
  return { ok: true };
});
