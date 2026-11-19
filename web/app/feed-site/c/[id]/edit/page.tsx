import { EditCommentPage } from "@/feed/views/comment-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <EditCommentPage shortId={(await params).id} />; }
