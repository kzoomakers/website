import { notFound } from "next/navigation";
import { splitPage, TagPage } from "@/feed/views/pages";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ tag: string; page?: string[] }> }) {
  const { tag, page } = await params, p = splitPage(page);
  if (p.rest.length) notFound();
  return <TagPage tag={tag} page={p.page} />;
}
