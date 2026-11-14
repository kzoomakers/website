import Shell from "../../blog/shell";
import { MessageThread } from "@/components/message-thread";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your conversation | Kzoo Makers", robots: { index: false } };

export default async function ThreadPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <Shell title="Your conversation" search={false}><MessageThread token={(await searchParams).token ?? ""} /></Shell>;
}
