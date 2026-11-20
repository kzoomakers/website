import { redirect } from "next/navigation";
import { getFeedConfig } from "../config";
import { currentFeedUser } from "../identity";
import { inboxFor } from "../models/comments";
import { commentVotes } from "../models/viewer-state";
import { CommentItem } from "./comment";
import Shell from "./shell";
import { Divider } from "./story-list";

/** inbox/all.html.erb for comments: the viewer's notifications. `which` is "all" or "unread". */
export default async function InboxPage({ which, page }: { which: "all" | "unread"; page: number }) {
  const me = await currentFeedUser().catch(() => null);
  if (!me?.username) redirect("/login?return=/inbox");
  const [{ comments, more }, cfg] = await Promise.all([inboxFor(me.id, which === "unread", page), getFeedConfig()]);
  const votes = await commentVotes(me.id, comments.map((c) => c.id));
  const title = which === "unread" ? "Unread Inbox" : "Inbox", path = `/inbox/${which}${page > 1 ? `/page/${page}` : ""}`;
  return (
    <Shell title={title} path={path} subnav={<><li><a href="/inbox/unread" aria-current={which === "unread" ? "page" : undefined}>Unread</a></li><li><a href="/inbox/all" aria-current={which === "all" ? "page" : undefined}>All</a></li></>}>
      <h1>{title}</h1>
      {comments.length === 0 && <p>{which === "unread" ? "Nothing unread." : "Nothing here yet."}</p>}
      <ol className="comments comments1">
        {comments.map((c) => (
          <li key={c.notification_id} className={c.read_at ? undefined : "unread"}>
            <CommentItem c={c} story={{ id: c.story_id, user_id: c.story_user_id!, user_is_author: !!c.story_user_is_author }} newUserDays={cfg.newUserDays} showStory me={me} votes={votes} />
            <ol className="comments" />
          </li>
        ))}
      </ol>
      {which === "all" && <nav className="morelink">
        {page > 1 && <a href={`/inbox/all/page/${page - 1}`} rel="prev">{`Page ${page - 1}`}</a>}
        {more && <>{page > 1 && <Divider />}<a href={`/inbox/all/page/${page + 1}`} rel="next">{`Page ${page + 1}`}</a></>}
      </nav>}
    </Shell>
  );
}
