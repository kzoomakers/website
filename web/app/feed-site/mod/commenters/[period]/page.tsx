import { notFound } from "next/navigation";
import { timeInterval } from "@/feed/interval";
import { CommentersPage } from "@/feed/views/mod-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// /mod/commenters/:period, like time_interval: an unreadable period is a 404 here, not Lobsters' silent one-week fallback.
export default async function Page({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<{ page?: string }> }) {
  const { period } = await params, pg = (await searchParams).page ?? "1", page = Number(pg);
  if (timeInterval(period).placeholder || !/^\d{1,9}$/.test(pg)) notFound();
  return <CommentersPage period={period} />;
}
