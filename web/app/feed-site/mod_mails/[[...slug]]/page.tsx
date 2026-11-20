import { notFound } from "next/navigation";
import { ModMailIndex, ModMailShow } from "@/feed/views/mod-mail-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const s = (await params).slug ?? [];
  if (!s.length) return <ModMailIndex mod={false} />;
  if (s.length === 1 && /^[a-z0-9]{1,10}$/.test(s[0])) return <ModMailShow mod={false} id={s[0]} />;
  notFound();
}
