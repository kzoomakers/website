import { notFound } from "next/navigation";
import { HatRequestNew, HatRequests } from "@/feed/views/hats-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const s = (await params).slug ?? [];
  if (!s.length) return <HatRequests />;
  if (s.length === 1 && s[0] === "new") return <HatRequestNew />;
  notFound();
}
