import { conn } from "@/lib/db";

/** What the signed-in viewer has already done on a page: their votes (story and comments), and whether they hid or saved the story. */
export type ViewerState = { storyVote: number; storyReason: string; comment: Map<number, { vote: number; reason: string }>; hidden: boolean; saved: boolean };

export async function viewerState(userId: number, storyIds: number[], commentIds: number[]): Promise<ViewerState> {
  const c = await conn();
  const [votes, h, s] = await Promise.all([
    c.query("SELECT story_id, comment_id, vote, reason FROM feed.votes WHERE user_id = $1 AND (story_id = ANY($2::bigint[]) OR comment_id = ANY($3::bigint[]))", [userId, storyIds, commentIds]),
    c.query("SELECT 1 FROM feed.hidden_stories WHERE user_id = $1 AND story_id = $2", [userId, storyIds[0]]),
    c.query("SELECT 1 FROM feed.saved_stories WHERE user_id = $1 AND story_id = $2", [userId, storyIds[0]]),
  ]);
  const st: ViewerState = { storyVote: 0, storyReason: "", comment: new Map(), hidden: !!h.rowCount, saved: !!s.rowCount };
  for (const v of votes.rows) {
    if (v.comment_id) st.comment.set(Number(v.comment_id), { vote: v.vote, reason: v.reason });
    else if (Number(v.story_id) === storyIds[0]) { st.storyVote = v.vote; st.storyReason = v.reason; }
  }
  return st;
}

/** The viewer's story votes, for a list: story id to 1 or -1. */
export async function storyVotes(userId: number, storyIds: number[]): Promise<Map<number, number>> {
  if (!storyIds.length) return new Map();
  const r = await (await conn()).query("SELECT story_id, vote FROM feed.votes WHERE user_id = $1 AND comment_id IS NULL AND story_id = ANY($2::bigint[])", [userId, storyIds]);
  return new Map(r.rows.map((v) => [Number(v.story_id), v.vote]));
}

/** The viewer's comment votes, for a list of comments. */
export async function commentVotes(userId: number, commentIds: number[]): Promise<ViewerState["comment"]> {
  if (!commentIds.length) return new Map();
  const r = await (await conn()).query("SELECT comment_id, vote, reason FROM feed.votes WHERE user_id = $1 AND comment_id = ANY($2::bigint[])", [userId, commentIds]);
  return new Map(r.rows.map((v) => [Number(v.comment_id), { vote: v.vote, reason: v.reason }]));
}
