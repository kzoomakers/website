import { notFound } from "next/navigation";
import { splitPage, CategoryPage } from "@/feed/views/pages";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ category: string; page?: string[] }> }) {
  const { category, page } = await params, p = splitPage(page);
  if (p.rest.length) notFound();
  return <CategoryPage category={category} page={p.page} />;
}
