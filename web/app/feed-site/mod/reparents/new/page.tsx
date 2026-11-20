import { notFound } from "next/navigation";
import ReparentPage from "@/feed/views/reparent-page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const id = (await searchParams).id;
  if (typeof id !== "string" || !id || id.length > 60) notFound();
  return <ReparentPage id={id} />;
}
