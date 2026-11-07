import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import History from "./history";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const slug = (await searchParams).slug ?? "";
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/webmaster");
  if (!getConfig()) redirect("/webmaster/setup");
  return <History slug={slug} />;
}
