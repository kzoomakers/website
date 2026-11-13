import Shell from "../../blog/shell";
import Checkin from "./checkin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Still interested in a tour? | Kzoo Makers", robots: { index: false } };

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ token?: string; a?: string }> }) {
  const q = await searchParams;
  return <Shell title="Still interested in a tour?" search={false}><Checkin token={q.token ?? ""} first={q.a ?? ""} /></Shell>;
}
