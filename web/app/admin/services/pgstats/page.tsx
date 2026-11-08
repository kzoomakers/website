import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import PgStats from "./pgstats";

export const dynamic = "force-dynamic";

export default async function PgStatsPage() {
  await gate("admin", "/admin/services/pgstats");
  if (!getConfig()) redirect("/admin/services");
  return <PgStats />;
}
