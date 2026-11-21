import SuggestPage from "@/feed/views/suggest-page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <SuggestPage shortId={(await params).id} />; }
