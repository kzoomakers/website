import { pageNumber } from "@/feed/views/listing";
import SavedPage from "@/feed/views/saved-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ page?: string[] }> }) {
  return <SavedPage kind="saved" page={pageNumber((await params).page)} />;
}
