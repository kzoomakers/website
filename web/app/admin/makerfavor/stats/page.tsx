import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Page from "./stats";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  await gate("chores", "/admin/makerfavor/stats");
  if (!getConfig()) redirect("/admin/services");
  return <Page />;
}
