import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import History from "./history";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const slug = (await searchParams).slug ?? "";
  await gate("webmaster", "/admin/webmaster");
  if (!getConfig()) redirect("/admin/services");
  return <History slug={slug} />;
}
