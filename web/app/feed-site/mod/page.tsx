import { ModActivityPage } from "@/feed/views/mod-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default function Page() { return <ModActivityPage />; }
