import { RequestQueue } from "@/feed/views/invitation-requests";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default function Page() { return <RequestQueue />; }
