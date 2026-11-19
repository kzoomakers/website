import { notFound } from "next/navigation";
import { splitPage, DomainPage } from "@/feed/views/pages";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string; page?: string[] }> }) {
  const { id, page } = await params, p = splitPage(page);
  if (p.rest.length) notFound();
  return <DomainPage id={id} page={p.page} />;
}
