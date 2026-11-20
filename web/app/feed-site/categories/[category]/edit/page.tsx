import { CategoryFormPage } from "@/feed/views/tag-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ category: string }> }) { return <CategoryFormPage name={(await params).category} />; }
