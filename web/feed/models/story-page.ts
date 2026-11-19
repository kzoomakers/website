import { conn } from "@/lib/db";
import type { Story } from "./stories";

export type StoryFull = Story & { token: string; user_id: number; is_deleted: boolean; is_moderated: boolean; user_banned_at: Date | null };
export type Comment = {
  id: number; short_id: string; story_id: number; parent_comment_id: number | null; depth: number; comment: string; markeddown_comment: string | null; score: number; flags: number;
  created_at: Date; last_edited_at: Date; is_deleted: boolean; is_moderated: boolean; is_from_email: boolean; username: string; user_id: number; user_created_at: Date | null; user_deleted_at: Date | null; user_banned_at: Date | null;
  hat: string | null; hat_link: string | null; hat_created_at: Date | null; moderator: string | null; mod_reason: string | null;
  story_title?: string; story_short_id?: string; story_user_id?: number; story_user_is_author?: boolean; // only on comment lists
};

const STORY = `SELECT s.id, s.short_id, s.title, s.url, s.created_at, s.score, s.flags, s.comments_count, s.stories_count, s.merged_story_id, s.description, s.markeddown_description, s.user_is_author, s.is_moderated, s.is_deleted, s.token, s.user_id,
  u.username, u.created_at AS user_created_at, u.deleted_at AS user_deleted_at, u.banned_at AS user_banned_at, d.domain, o.identifier AS origin,
  COALESCE((SELECT json_agg(json_build_object('tag', t.tag, 'description', t.description, 'is_media', t.is_media) ORDER BY tg.id) FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = s.id), '[]') AS tags
  FROM feed.stories s JOIN feed.users u ON u.id = s.user_id LEFT JOIN feed.domains d ON d.id = s.domain_id LEFT JOIN feed.origins o ON o.id = s.origin_id`;

/** story.rb is_gone?: deleted, or a negative-score story by a banned user that no moderator has reviewed. */
export const isGone = (s: Pick<StoryFull, "is_deleted" | "user_banned_at" | "score" | "is_moderated">) => s.is_deleted || (!!s.user_banned_at && s.score < 0 && !s.is_moderated);

export async function findStory(shortId: string): Promise<StoryFull | null> {
  return (await (await conn()).query(`${STORY} WHERE s.short_id = $1`, [shortId])).rows[0] ?? null;
}

/** Stories merged into this one that a visitor may see (not deleted). */
export async function mergedStories(id: number): Promise<StoryFull[]> {
  return (await (await conn()).query(`${STORY} WHERE s.merged_story_id = $1 AND NOT s.is_deleted ORDER BY s.id`, [id])).rows;
}

/** Comments of these stories in thread order: each comment's sort key is its parent's key plus its own 3-byte confidence_order (comment.rb story_threads), stories in the order given. */
export async function storyComments(storyIds: number[]): Promise<Comment[]> {
  return (await (await conn()).query(
    `WITH RECURSIVE t AS (
       SELECT c.id, c.confidence_order AS path FROM feed.comments c WHERE c.story_id = ANY($1::bigint[]) AND c.parent_comment_id IS NULL
       UNION ALL SELECT c.id, t.path || c.confidence_order FROM feed.comments c JOIN t ON c.parent_comment_id = t.id)
     SELECT c.id, c.short_id, c.story_id, c.parent_comment_id, c.depth, c.comment, c.markeddown_comment, c.score, c.flags, c.created_at, c.last_edited_at, c.is_deleted, c.is_moderated, c.is_from_email,
       u.username, u.id AS user_id, u.created_at AS user_created_at, u.deleted_at AS user_deleted_at, u.banned_at AS user_banned_at, h.hat, h.link AS hat_link, h.created_at AS hat_created_at, m.reason AS mod_reason, mu.username AS moderator
     FROM t JOIN feed.comments c ON c.id = t.id JOIN feed.users u ON u.id = c.user_id LEFT JOIN feed.hats h ON h.id = c.hat_id
     LEFT JOIN LATERAL (SELECT reason, moderator_user_id FROM feed.moderations WHERE comment_id = c.id ORDER BY id DESC LIMIT 1) m ON true LEFT JOIN feed.users mu ON mu.id = m.moderator_user_id
     ORDER BY array_position($1::bigint[], c.story_id), t.path`, [storyIds])).rows;
}

/** Comment short id to the story page that shows it (a comment of a merged story lives on the story it was merged into). */
export async function storyForComment(shortId: string): Promise<{ short_id: string; title: string } | null> {
  return (await (await conn()).query(
    `SELECT s.short_id, s.title FROM feed.comments c JOIN feed.stories s2 ON s2.id = c.story_id JOIN feed.stories s ON s.id = COALESCE(s2.merged_story_id, s2.id) WHERE c.short_id = $1`, [shortId])).rows[0] ?? null;
}
