import { RequestPage } from "@/feed/views/invitation-requests";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <RequestPage done={q.sent === "1"} confirmed={q.confirmed === "1"} error={q.error?.slice(0, 200)} />;
}
