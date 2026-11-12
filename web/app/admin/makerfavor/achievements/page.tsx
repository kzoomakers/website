import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Page from "./achievements";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  await gate("chores", "/admin/makerfavor/achievements");
  if (!getConfig()) redirect("/admin/services");
  return <Page />;
}
