import Shell from "../../blog/shell";
import Thread from "@/components/tour-thread";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your tour conversation | Kzoo Makers", robots: { index: false } };

export default async function ThreadPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <Shell title="Your tour conversation" search={false}><Thread token={(await searchParams).token ?? ""} /></Shell>;
}
