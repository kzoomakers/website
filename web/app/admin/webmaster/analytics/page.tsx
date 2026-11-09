import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { adminView } from "@/lib/ga";
import Analytics from "./analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await gate("webmaster", "/admin/webmaster/analytics");
  if (!getConfig()) redirect("/admin/services");
  const v = await adminView();
  return <Analytics ready={v.enabled && !!v.propertyId && !!v.serviceAccount} />;
}
