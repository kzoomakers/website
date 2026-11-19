import { notFound } from "next/navigation";
import Listing, { pageNumber } from "@/feed/views/listing";

export const dynamic = "force-dynamic";

export default async function FeedHomePage({ params }: { params: Promise<{ n: string }> }) {
  const page = pageNumber(["page", (await params).n]);
  if (page === 1) notFound();
  return <Listing kind="hottest" page={page} />;
}
