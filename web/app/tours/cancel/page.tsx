import Shell from "../../blog/shell";
import Cancel from "./cancel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cancel your tour | Kzoo Makers", robots: { index: false } };

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <Shell title="Cancel your tour" search={false}><Cancel token={(await searchParams).token ?? ""} /></Shell>;
}
