import { NewStoryPage } from "@/feed/views/submit";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ url?: string | string[] }> }) {
  const { url } = await searchParams;
  return <NewStoryPage url={typeof url === "string" ? url : undefined} />;
}
