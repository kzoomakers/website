import Shell from "../../blog/shell";
import Respond from "./respond";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pick your tour time | Kzoo Makers", robots: { index: false } };

export default async function RespondPage({ searchParams }: { searchParams: Promise<{ token?: string; pick?: string; none?: string }> }) {
  const q = await searchParams;
  return <Shell title="Pick your tour time" search={false}><Respond token={q.token ?? ""} pick={q.pick ? Number(q.pick) : -1} none={!!q.none} /></Shell>;
}
