import { notFound } from "next/navigation";
import { getFeedConfig } from "../config";
import { newestComments } from "../models/comments";
import { CommentItem } from "./comment";
import Shell from "./shell";
import { Divider } from "./story-list";

/** comments/index.html.erb for a visitor. */
export default async function CommentsPage({ page }: { page: number }) {
  const [{ comments, more }, cfg] = await Promise.all([newestComments(page), getFeedConfig()]);
  if (page > 1 && !comments.length) notFound();
  const path = page > 1 ? `/comments/page/${page}` : "/comments";
  return (
    <Shell title="Newest Comments" path={path}>
      <h1 className="">Newest Comments</h1>
      <ol className="comments comments1">
        {comments.map((c) => (
          <li key={c.id}>
            <CommentItem c={c} story={{ id: c.story_id, user_id: c.story_user_id!, user_is_author: !!c.story_user_is_author }} newUserDays={cfg.newUserDays} showStory />
            <ol className="comments" />
          </li>
        ))}
      </ol>
      <nav className="morelink">
        {comments.length > 0 && <>
          {page > 1 && <a href={`/comments/page/${page - 1}?last_read_timestamp=0`} rel="prev">{`Page ${page - 1}`}</a>}
          {more && <>{page > 1 && <Divider />}<a href={`/comments/page/${page + 1}?last_read_timestamp=0`} rel="next">{`Page ${page + 1}`}</a></>}
        </>}
      </nav>
    </Shell>
  );
}
