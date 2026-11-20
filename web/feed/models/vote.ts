import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getFeedConfig } from "../config";
import { updateCachedColumns } from "./cached";
import { lockCommentStory, recalcComment } from "./comment-cache";
import { live, tx } from "./submit";

// Voting (vote.rb vote_thusly_on_story_or_comment_for_user_because + the vote actions of stories_ and comments_controller), one transaction each.

export const STORY_REASONS = { O: "Off-topic", A: "Already Posted", B: "Broken Link", S: "Spam" } as const;
export const COMMENT_REASONS = { O: "Off-topic", M: "Me-too", T: "Troll", U: "Unkind", S: "Spam" } as const;
const STORY_FLAGGABLE_DAYS = 14, COMMENT_FLAGGABLE_DAYS = 7, STORY_MIN_SCORE = -5, COMMENT_MIN_SCORE = -10;

export type VoteResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): VoteResult => ({ ok: false, error });

/** story.rb update_score_and_recalculate!: score and flags from the votes table (flags from people who commented don't count, they should say it in a comment), then hotness. Call inside the writer's transaction. */
export async function recalcStory(c: PoolClient, storyId: number): Promise<void> {
  const mine = `v.story_id = $1 AND v.comment_id IS NULL AND (v.vote = 1 OR (v.vote = -1 AND NOT EXISTS (SELECT 1 FROM feed.comments m WHERE m.user_id = v.user_id AND m.story_id = $1)))`;
  await c.query(`UPDATE feed.stories SET score = (SELECT COALESCE(sum(v.vote), 0) FROM feed.votes v WHERE ${mine}), flags = (SELECT count(*) FROM feed.votes v WHERE ${mine} AND v.vote = -1) WHERE id = $1`, [storyId]);
  await updateCachedColumns(c, storyId);
}

/** vote: 1 upvote, -1 flag (reason required), 0 remove your vote. kind picks the target: a story short id or a comment short id. */
export const castVote = (user: { id: number }, kind: "story" | "comment", shortId: string, vote: 1 | -1 | 0, reason = ""): Promise<VoteResult> => tx(async (c) => {
  const u = await live(c, user.id), cfg = await getFeedConfig();
  if (!u || u.banned_at || u.deleted_at) return fail("not permitted");
  if (vote === -1 && !Object.hasOwn(kind === "story" ? STORY_REASONS : COMMENT_REASONS, reason)) return fail("invalid reason");

  // the target, locked so two votes on it can't both recalculate from stale rows
  let t: { id: number; story_id: number; user_id: number; score: number; created_at: Date; gone: boolean; merged: boolean };
  if (kind === "story") {
    t = (await c.query(
      `SELECT s.id, s.id AS story_id, s.user_id, s.score, s.created_at, (s.is_deleted OR (b.banned_at IS NOT NULL AND s.score < 0 AND NOT s.is_moderated)) AS gone, s.merged_story_id IS NOT NULL AS merged
       FROM feed.stories s JOIN feed.users b ON b.id = s.user_id WHERE s.short_id = $1 FOR UPDATE OF s`, [shortId])).rows[0];
  } else {
    await lockCommentStory(c, shortId);
    t = (await c.query(
      `SELECT c.id, c.story_id, c.user_id, c.score, c.created_at, (c.is_deleted OR c.is_moderated OR s.is_deleted) AS gone, false AS merged
       FROM feed.comments c JOIN feed.stories s ON s.id = c.story_id WHERE c.short_id = $1 FOR UPDATE OF c`, [shortId])).rows[0];
  }
  if (!t || t.gone) return fail(`can't find ${kind}`);
  const cid = kind === "comment" ? t.id : null;
  const old = (await c.query("SELECT id, vote FROM feed.votes WHERE user_id = $1 AND story_id = $2 AND comment_id IS NOT DISTINCT FROM $3", [user.id, t.story_id, cid])).rows[0];

  if (vote === 1 && t.merged) return fail("story has been merged");
  if (vote === -1) {
    // user.rb can_flag?: new users never; stories by anyone else while flaggable; comments also need karma. Someone who already flagged may always take it back.
    const isNew = new Date(u.created_at).getTime() > Date.now() - cfg.newUserDays * 864e5;
    const age = Date.now() - new Date(t.created_at).getTime();
    const open = t.user_id !== user.id && t.score > (kind === "story" ? STORY_MIN_SCORE : COMMENT_MIN_SCORE) && age <= (kind === "story" ? STORY_FLAGGABLE_DAYS : COMMENT_FLAGGABLE_DAYS) * 864e5;
    const karma = (await c.query("SELECT karma FROM feed.users WHERE id = $1", [user.id])).rows[0].karma;
    if (isNew || !(open && (kind === "story" || karma >= cfg.minKarmaToFlag)) && !(kind === "story" && old?.vote === -1)) return fail("not permitted to flag");
    // validate_flagger_hasnt_replied
    if (kind === "comment" && (await c.query("SELECT 1 FROM feed.comments WHERE user_id = $1 AND parent_comment_id = $2", [user.id, t.id])).rowCount) return fail("You've already replied to the comment.");
  }
  if ((old?.vote ?? 0) === vote) return { ok: true };

  const scoreDelta = vote === 1 ? 1 : old?.vote === 1 ? -1 : 0;
  if (vote === 0) await c.query("DELETE FROM feed.votes WHERE id = $1", [old.id]);
  else if (old) await c.query("UPDATE feed.votes SET vote = $2, reason = $3, updated_at = now() WHERE id = $1", [old.id, vote, vote === -1 ? reason : ""]);
  else await c.query("INSERT INTO feed.votes (user_id, story_id, comment_id, vote, reason) VALUES ($1, $2, $3, $4, $5)", [user.id, t.story_id, cid, vote, vote === -1 ? reason : ""]);
  if (t.user_id !== user.id && scoreDelta) await c.query("UPDATE feed.users SET karma = karma + $2 WHERE id = $1", [t.user_id, scoreDelta]);

  if (kind === "comment") await recalcComment(c, t.id);
  else {
    await recalcStory(c, t.id);
    // a flagged story drops out of your own view
    if (vote === -1) await c.query("INSERT INTO feed.hidden_stories (user_id, story_id, created_at, token) VALUES ($1, $2, now(), $3) ON CONFLICT (user_id, story_id) DO NOTHING", [user.id, t.id, `hidden_${randomBytes(16).toString("hex")}`]);
  }
  return { ok: true };
});
