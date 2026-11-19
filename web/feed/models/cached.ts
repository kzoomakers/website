import type { PoolClient } from "pg";
import { hotness } from "../logic";

/** story.rb update_cached_columns: comments_count (live comments on this story and ones merged into it) and hotness, then the same for the story this one is merged into. Call inside the writer's transaction. */
export async function updateCachedColumns(c: PoolClient, storyId: number): Promise<void> {
  const s = (await c.query("SELECT id, user_id, score, user_is_author, url, created_at, merged_story_id FROM feed.stories WHERE id = $1 FOR UPDATE", [storyId])).rows[0];
  if (!s) return;
  const count = (await c.query("SELECT count(*)::int n FROM feed.comments c JOIN feed.stories st ON st.id = c.story_id WHERE (st.id = $1 OR st.merged_story_id = $1) AND NOT c.is_deleted AND NOT c.is_moderated", [storyId])).rows[0].n;
  const base = Number((await c.query("SELECT COALESCE(sum(t.hotness_mod), 0) b FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = $1", [storyId])).rows[0].b) + (s.user_is_author && s.url ? 0.25 : 0);
  // comment votes count for half, ignoring the submitter's own comments (all comments here, deleted or not, as comments.score + 1 sums in story.rb)
  const cp = base < 0 ? 0 : Number((await c.query("SELECT COALESCE(sum(c.score + 1), 0) p FROM feed.comments c JOIN feed.stories st ON st.id = c.story_id WHERE (st.id = $1 OR st.merged_story_id = $1) AND c.user_id <> $2", [storyId, s.user_id])).rows[0].p) * 0.5;
  const merged = Number((await c.query("SELECT COALESCE(sum(score), 0) m FROM feed.stories WHERE merged_story_id = $1", [storyId])).rows[0].m);
  await c.query("UPDATE feed.stories SET comments_count = $2, hotness = $3 WHERE id = $1", [storyId, count, hotness({ score: s.score, base, commentPoints: cp, mergedScore: merged, createdAt: s.created_at })]);
  if (s.merged_story_id) await updateCachedColumns(c, s.merged_story_id);
}
