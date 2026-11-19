import { EditStoryPage } from "@/feed/views/submit";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <EditStoryPage shortId={(await params).id} />; }
