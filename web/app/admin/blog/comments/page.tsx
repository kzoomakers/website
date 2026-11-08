import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { allComments, counts, getSettings } from "@/lib/comments";
import Moderation from "./moderation";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  await gate("blog", "/admin/blog/comments");
  if (!getConfig()) redirect("/admin/services");
  const [n, settings] = await Promise.all([counts(), getSettings()]);
  // Open on the queue that needs attention, else everything.
  const tab = n.pending ? "pending" : "approved";
  return <Moderation initial={await allComments(tab)} tab={tab} counts={n} settings={settings} />;
}
