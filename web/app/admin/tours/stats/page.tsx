import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { stats } from "@/lib/tours";
import Stats from "./stats";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  await gate("tours", "/admin/tours/stats");
  if (!getConfig()) redirect("/admin/services");
  return <Stats initial={await stats(90)} />;
}
