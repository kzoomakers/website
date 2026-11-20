import { notFound } from "next/navigation";
import { HatDoff, HatEdit, HatsIndex } from "@/feed/views/hats-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const s = (await params).slug ?? [];
  if (!s.length) return <HatsIndex />;
  if (s.length === 2 && /^[a-z0-9]{1,10}$/.test(s[0])) {
    if (s[1] === "doff") return <HatDoff id={s[0]} />;
    if (s[1] === "edit") return <HatEdit id={s[0]} />;
  }
  notFound();
}
