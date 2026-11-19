import { splitPage } from "@/feed/views/pages";
import CommentsPage from "@/feed/views/comments-page";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ page?: string[] }> }) {
  const p = splitPage((await params).page);
  if (p.rest.length) notFound();
  return <CommentsPage page={p.page} />;
}
