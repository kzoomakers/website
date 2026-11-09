import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Referrers from "./referrers";

export const dynamic = "force-dynamic";

export default async function ReferrersPage() {
  await gate("webmaster", "/admin/webmaster/referrers");
  if (!getConfig()) redirect("/admin/services");
  return <Referrers />;
}
