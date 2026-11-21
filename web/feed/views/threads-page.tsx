import { notFound } from "next/navigation";
import { getFeedConfig } from "../config";
import { recentThreads, type ListedComment } from "../models/comments";
import { findUser } from "../models/stories";
import { CommentItem } from "./comment";
import Shell from "./shell";

/** comments/user_threads.html.erb: the user's 20 most recent threads, each reply nested under its parent. */
export default async function UserThreadsPage({ username }: { username: string }) {
  const u = await findUser(decodeURIComponent(username));
  if (!u) notFound();
  const [comments, cfg] = await Promise.all([recentThreads(u.id), getFeedConfig()]);
  const kids = new Map<number | null, ListedComment[]>(), ids = new Set(comments.map((c) => c.id));
  for (const c of comments) { const k = c.parent_comment_id != null && ids.has(c.parent_comment_id) ? c.parent_comment_id : null; kids.set(k, [...(kids.get(k) ?? []), c]); }
  const tree = (parent: number | null): React.ReactNode => (kids.get(parent) ?? []).map((c) => (
    <li className="comments_subtree" key={c.id}>
      <CommentItem c={c} story={{ id: c.story_id, user_id: c.story_user_id!, user_is_author: !!c.story_user_is_author }} newUserDays={cfg.newUserDays} showStory={c.parent_comment_id == null} />
      <ol className="comments">{tree(c.id)}</ol>
    </li>
  ));
  return (
    <Shell title={`Threads for ${u.username}`} path={`/~${u.username}/threads`}>
      <h1>Threads for {u.username}</h1>
      <ol className="comments comments1"><li className="comments_subtree"><ol className="comments" id="story_comments">{tree(null)}</ol></li></ol>
    </Shell>
  );
}
