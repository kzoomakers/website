import { notFound, redirect } from "next/navigation";
import { currentFeedUser } from "@/feed/identity";
import { conn } from "@/lib/db";
import InboxPage from "@/feed/views/inbox-page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// /inbox goes to the unread list when something is unread, else to all (inbox_controller#index). Unread has no pages: it lists everything unread.
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const seg = (await params).slug ?? [];
  if (!seg.length) {
    const me = await currentFeedUser().catch(() => null);
    if (!me) redirect("/login?return=/inbox");
    const n = (await (await conn()).query("SELECT 1 FROM feed.notifications WHERE user_id = $1 AND read_at IS NULL AND notifiable_type = 'Comment' LIMIT 1", [me.id])).rowCount;
    redirect(n ? "/inbox/unread" : "/inbox/all");
  }
  if (seg[0] === "unread" && seg.length === 1) return <InboxPage which="unread" page={1} />;
  if (seg[0] === "all" && seg.length === 1) return <InboxPage which="all" page={1} />;
  const n = Number(seg[2]);
  if (seg[0] === "all" && seg.length === 3 && seg[1] === "page" && Number.isInteger(n) && n >= 1 && n < 2 ** 32) return <InboxPage which="all" page={n} />;
  notFound();
}
