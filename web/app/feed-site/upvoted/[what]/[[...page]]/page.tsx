import { notFound } from "next/navigation";
import { pageNumber } from "@/feed/views/listing";
import SavedPage from "@/feed/views/saved-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ what: string; page?: string[] }> }) {
  const { what, page } = await params;
  if (what !== "stories" && what !== "comments") notFound();
  return <SavedPage kind={`upvoted-${what}`} page={pageNumber(page)} />;
}
