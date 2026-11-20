import { TagFormPage } from "@/feed/views/tag-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ tag: string }> }) { return <TagFormPage name={(await params).tag} />; }
