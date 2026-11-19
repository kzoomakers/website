import type { PoolClient } from "pg";
import { confidence, confidenceOrder } from "../logic";
import { updateCachedColumns } from "./cached";

/** comment.rb update_score_and_recalculate!: score and flags come from the votes table, then confidence and its sort key, then the story's cached columns. Call inside the writer's transaction. */
export async function recalcComment(c: PoolClient, commentId: number): Promise<void> {
  const r = (await c.query(
    `UPDATE feed.comments SET score = (SELECT COALESCE(sum(vote), 0) FROM feed.votes WHERE comment_id = feed.comments.id), flags = (SELECT count(*) FROM feed.votes WHERE comment_id = feed.comments.id AND vote = -1)
     WHERE id = $1 RETURNING score, flags, is_deleted, is_moderated, story_id`, [commentId])).rows[0];
  if (!r) return;
  const conf = confidence(r.score, r.flags, r.is_deleted || r.is_moderated);
  await c.query("UPDATE feed.comments SET confidence = $2, confidence_order = $3 WHERE id = $1", [commentId, conf, confidenceOrder(conf, commentId)]);
  await updateCachedColumns(c, r.story_id);
}
