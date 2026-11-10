import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { adminView } from "@/lib/ga";
import GoogleAnalytics from "./google-analytics";

export const dynamic = "force-dynamic";

export default async function GoogleAnalyticsPage() {
  const level = await gate("admin", "/admin/services/google-analytics");
  if (!getConfig()) redirect("/admin/services");
  return <GoogleAnalytics initial={await adminView()} canEdit={level === "write"} />;
}
