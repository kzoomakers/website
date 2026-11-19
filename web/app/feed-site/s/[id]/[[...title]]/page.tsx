import { notFound, redirect } from "next/navigation";
import { currentFeedUser } from "@/feed/identity";
import { findStory, isGone, mergedStories, storyComments } from "@/feed/models/story-page";
import { titleAsSlug } from "@/feed/util";
import StoryPage from "@/feed/views/story-page";
import { titlePath } from "@/feed/views/story-list";

export const dynamic = "force-dynamic";

// stories_controller#show for a visitor: a merged story sends you to the one it was merged into; a gone story is a 404; the URL is canonicalized to /s/id/title_slug.
export default async function Page({ params }: { params: Promise<{ id: string; title?: string[] }> }) {
  const { id, title } = await params;
  const story = await findStory(id);
  if (!story) notFound();
  if (story.merged_story_id) {
    const { rows } = await (await import("@/lib/db")).conn().then((c) => c.query("SELECT short_id, title, token FROM feed.stories WHERE id = $1", [story.merged_story_id]));
    if (rows[0]) redirect(`${titlePath(rows[0])}#header_${story.token}`);
  }
  if (isGone(story) && (await currentFeedUser().catch(() => null))?.id !== story.user_id) notFound(); // can_be_seen_by_user?: the submitter still sees their deleted story
  if ((title ?? []).join("/") !== titleAsSlug(story.title)) redirect(titlePath(story));
  const all = [story, ...(await mergedStories(story.id))];
  return <StoryPage all={all} comments={await storyComments(all.map((s) => s.id))} />;
}
