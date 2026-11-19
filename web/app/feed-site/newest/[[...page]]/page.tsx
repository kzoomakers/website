import Listing, { pageNumber } from "@/feed/views/listing";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ page?: string[] }> }) {
  return <Listing kind="newest" page={pageNumber((await params).page)} />;
}
